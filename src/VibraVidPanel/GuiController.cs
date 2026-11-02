using Jellyfin.Data;
using Jellyfin.Database.Implementations.Enums;
using MediaBrowser.Controller.Net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.Extensions.Logging;
using System.Text;

namespace VibraVidPanel;

[ApiController]
[Route("VibraVidPanel")]
public sealed class GuiController(GuiSessions sessions, IAuthService authentication, DownloadActivity activity, ILogger<GuiController> logger) : ControllerBase
{
    [Authorize]
    [HttpPost("session")]
    public IActionResult Open()
    {
        var configuration = Plugin.Instance?.Configuration;
        if (configuration is null || !configuration.Enabled) return NotFound();
        if (configuration.OnlyAdministrators && !User.IsInRole("Administrator")) return Forbid();
        var error = SettingsValidation.GetError(configuration);
        if (error is not null || string.IsNullOrWhiteSpace(configuration.GuiUrl))
            return BadRequest(new { Message = error ?? "Configura l’indirizzo interno di VibraVid nelle impostazioni del plugin." });
        var authToken = User.FindFirst("Jellyfin-Token")?.Value;
        if (string.IsNullOrEmpty(authToken)) return Unauthorized();
        try
        {
            var session = sessions.Create(authToken, new Uri(configuration.GuiUrl.Trim().TrimEnd('/') + "/"));
            Response.Headers.CacheControl = "no-store";
            return Ok(new { Url = Request.PathBase + "/VibraVidPanel/gui/" + session.Ticket + "/", Ticket = session.Ticket });
        }
        catch (InvalidOperationException) { return StatusCode(429, new { Message = "Troppe sessioni attive. Riprova tra poco." }); }
    }

    [Authorize]
    [HttpDelete("session/{ticket}")]
    public IActionResult Close(string ticket)
    {
        var session = sessions.Get(ticket);
        if (session is not null && session.AuthToken != User.FindFirst("Jellyfin-Token")?.Value) return Forbid();
        sessions.Remove(ticket);
        return NoContent();
    }

    [AllowAnonymous]
    [AcceptVerbs("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")]
    [Route("gui/{ticket}/{**path}")]
    [RequestSizeLimit(64 * 1024 * 1024)]
    [RawProxyBody]
    public async Task Proxy([FromRoute] string ticket, [FromRoute] string? path)
    {
        Response.Headers.CacheControl = "no-store";
        Response.Headers["Referrer-Policy"] = "no-referrer";
        var origin = Request.Headers.Origin.ToString();
        var publicOrigin = Request.Scheme + "://" + Request.Host;
        if (origin.Length > 0 && origin != "null" && origin != publicOrigin)
        { await Error(403, "Origine della richiesta non consentita."); return; }
        if (origin.Length > 0) Response.Headers.AccessControlAllowOrigin = origin;
        Response.Headers.Vary = "Origin";
        Response.Headers.AccessControlAllowMethods = "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS";
        Response.Headers.AccessControlAllowHeaders = "Content-Type, X-CSRFToken, X-Requested-With, Range";
        Response.Headers.AccessControlExposeHeaders = "Content-Disposition, Content-Type";
        var session = sessions.Get(ticket);
        var configuration = Plugin.Instance?.Configuration;
        if (session is null || configuration?.Enabled != true)
        { await Error(401, "La sessione del pannello è scaduta. Chiudi e riapri VibraVid da Jellyfin."); return; }
        Guid userId = Guid.Empty;
        string username = string.Empty;
        try
        {
            var verification = new DefaultHttpContext { RequestServices = HttpContext.RequestServices };
            verification.Request.Headers.Authorization = "MediaBrowser Token=\"" + session.AuthToken + "\"";
            var authorization = await authentication.Authenticate(verification.Request).ConfigureAwait(false);
            var administrator = authorization.IsApiKey || (authorization.User?.HasPermission(PermissionKind.IsAdministrator) ?? false);
            if (!authorization.IsAuthenticated || configuration.OnlyAdministrators && !administrator)
            { sessions.Remove(ticket); await Error(401, "Accedi nuovamente a Jellyfin per aprire VibraVid."); return; }
            if (authorization.User is { } user) { userId = user.Id; username = user.Username; }
        }
        catch (Exception) { sessions.Remove(ticket); await Error(401, "Accedi nuovamente a Jellyfin per aprire VibraVid."); return; }
        if (HttpMethods.IsOptions(Request.Method)) { Response.StatusCode = 204; return; }
        if (!new[] { "GET", "HEAD", "POST", "PUT", "PATCH", "DELETE" }.Contains(Request.Method))
        { await Error(405, "Metodo non supportato."); return; }
        var relative = (path ?? string.Empty).TrimStart('/');
        if (!Uri.TryCreate(session.Upstream, relative + Request.QueryString, out var target) ||
            target.Scheme != session.Upstream.Scheme || target.Authority != session.Upstream.Authority ||
            !target.AbsolutePath.StartsWith(session.Upstream.AbsolutePath, StringComparison.Ordinal))
        { await Error(400, "Percorso della GUI non valido."); return; }
        var prefix = Request.PathBase + "/VibraVidPanel/gui/" + ticket + "/";
        try
        {
            var intent = userId == Guid.Empty ? null : await activity.ReadIntent(Request, relative).ConfigureAwait(false);
            using var message = new HttpRequestMessage(new HttpMethod(Request.Method), target);
            if (Request.ContentLength is > 0 || Request.Headers.ContainsKey("Transfer-Encoding"))
            {
                message.Content = new StreamContent(Request.Body);
                if (Request.ContentLength.HasValue) message.Content.Headers.ContentLength = Request.ContentLength.Value;
                if (!string.IsNullOrWhiteSpace(Request.ContentType)) message.Content.Headers.TryAddWithoutValidation("Content-Type", Request.ContentType);
            }
            foreach (var name in new[] { "Accept", "Accept-Language", "Range", "X-CSRFToken", "X-Requested-With" })
                if (Request.Headers.TryGetValue(name, out var value)) message.Headers.TryAddWithoutValidation(name, value.ToArray());
            message.Headers.TryAddWithoutValidation("Origin", session.Upstream.GetLeftPart(UriPartial.Authority));
            message.Headers.Referrer = target;
            using var upstream = await session.Client.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, HttpContext.RequestAborted).ConfigureAwait(false);
            await activity.Record(intent, upstream, target, session.Upstream, userId, username).ConfigureAwait(false);
            Response.StatusCode = (int)upstream.StatusCode;
            if (upstream.Headers.Location is { } location)
            {
                var redirect = location.IsAbsoluteUri ? location : new Uri(target, location);
                if (redirect.Authority != session.Upstream.Authority || redirect.Scheme != session.Upstream.Scheme ||
                    !redirect.AbsolutePath.StartsWith(session.Upstream.AbsolutePath, StringComparison.Ordinal))
                { await Error(502, "La GUI ha richiesto un reindirizzamento esterno non supportato."); return; }
                Response.Headers.Location = prefix + redirect.AbsolutePath[session.Upstream.AbsolutePath.Length..] + redirect.Query + redirect.Fragment;
            }
            if (upstream.Content.Headers.ContentDisposition is { } disposition) Response.Headers.ContentDisposition = disposition.ToString();
            var type = upstream.Content.Headers.ContentType?.MediaType ?? "application/octet-stream";
            var text = type.StartsWith("text/", StringComparison.OrdinalIgnoreCase) || type.Contains("javascript") || type == "application/json";
            var html = type.Equals("text/html", StringComparison.OrdinalIgnoreCase);
            if (html)
                Response.Headers.ContentSecurityPolicy = "sandbox allow-scripts allow-forms allow-downloads; frame-ancestors 'self'; object-src 'none'; base-uri 'self'";
            Response.ContentType = text ? type + "; charset=utf-8" : upstream.Content.Headers.ContentType?.ToString() ?? type;
            if (HttpMethods.IsHead(Request.Method)) return;
            await using var stream = await upstream.Content.ReadAsStreamAsync(HttpContext.RequestAborted).ConfigureAwait(false);
            if (text)
            {
                using var buffer = new MemoryStream();
                var chunk = new byte[65536];
                int count;
                while ((count = await stream.ReadAsync(chunk, HttpContext.RequestAborted).ConfigureAwait(false)) > 0)
                {
                    if (buffer.Length + count > 8 * 1024 * 1024) { await Error(502, "La risposta della GUI è troppo grande."); return; }
                    buffer.Write(chunk, 0, count);
                }
                var content = Encoding.UTF8.GetString(buffer.ToArray());
                if (!type.Equals("application/json", StringComparison.OrdinalIgnoreCase))
                    content = GuiRewrite.Rewrite(content, session, prefix, relative, html);
                await Response.WriteAsync(content, HttpContext.RequestAborted).ConfigureAwait(false);
            }
            else await stream.CopyToAsync(Response.Body, HttpContext.RequestAborted).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (HttpContext.RequestAborted.IsCancellationRequested) { }
        catch (Exception error) when (!Response.HasStarted)
        {
            logger.LogWarning("VibraVid Panel: inoltro non riuscito ({Type}/{Inner})", error.GetType().Name, error.InnerException?.GetType().Name);
            await Error(502, "Jellyfin non riesce a raggiungere VibraVid. Verifica l’indirizzo interno nelle impostazioni del plugin.");
        }
    }

    private async Task Error(int code, string message)
    {
        Response.StatusCode = code;
        Response.ContentType = "text/html; charset=utf-8";
        await Response.WriteAsync("<!doctype html><html lang=\"it\"><meta name=\"viewport\" content=\"width=device-width\"><body style=\"font:17px system-ui;background:#15151d;color:white;padding:24px\"><p>" + System.Net.WebUtility.HtmlEncode(message) + "</p></body></html>");
    }
}

/// <summary>Keep MVC's form value providers from consuming the forwarded body.</summary>
[AttributeUsage(AttributeTargets.Method)]
public sealed class RawProxyBodyAttribute : Attribute, IResourceFilter
{
    public void OnResourceExecuting(ResourceExecutingContext context)
    {
        for (var index = context.ValueProviderFactories.Count - 1; index >= 0; index--)
            if (context.ValueProviderFactories[index] is FormValueProviderFactory or FormFileValueProviderFactory or JQueryFormValueProviderFactory)
                context.ValueProviderFactories.RemoveAt(index);
    }

    public void OnResourceExecuted(ResourceExecutedContext context) { }
}
