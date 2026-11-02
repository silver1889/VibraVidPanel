using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace VibraVidPanel;

/// <summary>Add a loader to the served web entry point without changing Jellyfin files.</summary>
public sealed class WebEntryMiddleware(RequestDelegate next, ILogger<WebEntryMiddleware> logger)
{
    private const string Marker = "id=\"vibravid-panel-loader\"";

    public async Task InvokeAsync(HttpContext context)
    {
        // BaseUrl is stripped by Jellyfin later in the pipeline. Match /web at the end
        // so both /web/index.html and /jellyfin/web/index.html work at this early stage.
        var path = context.Request.Path.Value ?? string.Empty;
        var webIndex = path.LastIndexOf("/web", StringComparison.OrdinalIgnoreCase);
        var suffix = webIndex >= 0 ? path[webIndex..] : string.Empty;
        if (!HttpMethods.IsGet(context.Request.Method) ||
            suffix is not ("/web" or "/web/" or "/web/index.html") ||
            Plugin.Instance?.Configuration.Enabled != true)
        {
            await next(context).ConfigureAwait(false);
            return;
        }

        var acceptEncoding = context.Request.Headers.AcceptEncoding;
        var ifNoneMatch = context.Request.Headers.IfNoneMatch;
        var ifModifiedSince = context.Request.Headers.IfModifiedSince;
        context.Request.Headers.Remove("Accept-Encoding");
        context.Request.Headers.Remove("If-None-Match");
        context.Request.Headers.Remove("If-Modified-Since");
        var originalBody = context.Response.Body;
        using var buffer = new MemoryStream();
        context.Response.Body = buffer;
        try
        {
            await next(context).ConfigureAwait(false);
            context.Response.Body = originalBody;
            if (context.Response.StatusCode == StatusCodes.Status200OK &&
                context.Response.ContentType?.StartsWith("text/html", StringComparison.OrdinalIgnoreCase) == true &&
                !context.Response.Headers.ContainsKey("Content-Encoding") && buffer.Length <= 4 * 1024 * 1024)
            {
                var html = Encoding.UTF8.GetString(buffer.GetBuffer(), 0, (int)buffer.Length);
                var closingHead = html.LastIndexOf("</head>", StringComparison.OrdinalIgnoreCase);
                if (closingHead >= 0 && !html.Contains(Marker, StringComparison.Ordinal))
                {
                    var basePath = context.Request.PathBase + path[..webIndex];
                    var url = HtmlEncoder.Default.Encode(basePath + "/VibraVidPanel/assets/menu.js?v=1.3.1.0");
                    html = html.Insert(closingHead, $"<script {Marker} defer src=\"{url}\"></script>");
                    var bytes = Encoding.UTF8.GetBytes(html);
                    context.Response.ContentLength = bytes.Length;
                    context.Response.Headers.Remove("ETag");
                    context.Response.Headers.Remove("Last-Modified");
                    context.Response.Headers.CacheControl = "no-store";
                    await originalBody.WriteAsync(bytes, context.RequestAborted).ConfigureAwait(false);
                    return;
                }
                if (closingHead < 0) logger.LogWarning("VibraVid Panel: punto di inserimento del menu web non trovato.");
            }
            buffer.Position = 0;
            await buffer.CopyToAsync(originalBody, context.RequestAborted).ConfigureAwait(false);
        }
        finally
        {
            context.Response.Body = originalBody;
            RestoreHeader(context.Request.Headers, "Accept-Encoding", acceptEncoding);
            RestoreHeader(context.Request.Headers, "If-None-Match", ifNoneMatch);
            RestoreHeader(context.Request.Headers, "If-Modified-Since", ifModifiedSince);
        }
    }

    private static void RestoreHeader(IHeaderDictionary headers, string name, Microsoft.Extensions.Primitives.StringValues value)
    {
        if (value.Count > 0) headers[name] = value;
        else headers.Remove(name);
    }
}
