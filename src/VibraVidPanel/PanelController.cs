using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace VibraVidPanel;

[ApiController]
[Route("VibraVidPanel")]
public sealed class PanelController(GuiSessions sessions) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet("assets/{name}")]
    public IActionResult GetAsset(string name)
    {
        var contentType = name switch { "menu.js" or "viewport.js" => "application/javascript; charset=utf-8", _ => null };
        if (contentType is null) return NotFound();
        var stream = typeof(Plugin).Assembly.GetManifestResourceStream("VibraVidPanel.Web." + name);
        if (stream is null) return NotFound();
        Response.Headers.CacheControl = "no-cache";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(stream, contentType);
    }

    [Authorize]
    [HttpGet("client")]
    public IActionResult GetClientSettings()
    {
        Response.Headers.CacheControl = "no-store";
        var configuration = Plugin.Instance?.Configuration;
        if (configuration is null) return StatusCode(503);
        if (configuration.OnlyAdministrators && !User.IsInRole("Administrator")) return Forbid();
        var error = SettingsValidation.GetError(configuration);
        return Ok(new
        {
            Enabled = configuration.Enabled,
            MenuTitle = error is null ? configuration.MenuTitle.Trim() : "Scarica film / serie TV",
            Configured = error is null && !string.IsNullOrWhiteSpace(configuration.GuiUrl),
            OpenMode = "proxy",
            Version = typeof(Plugin).Assembly.GetName().Version?.ToString(),
            IsAdministrator = User.IsInRole("Administrator"),
            ConfigurationError = error
        });
    }

    [Authorize(Policy = "RequiresElevation")]
    [HttpGet("settings")]
    public IActionResult GetSettings()
    {
        Response.Headers.CacheControl = "no-store";
        return Ok(Plugin.Instance?.Configuration);
    }

    [Authorize(Policy = "RequiresElevation")]
    [HttpPost("settings")]
    public IActionResult SaveSettings([FromBody] PluginConfiguration settings)
    {
        var error = SettingsValidation.GetError(settings);
        if (error is not null) return BadRequest(new { Message = error });
        settings.GuiUrl = settings.GuiUrl.Trim();
        settings.MenuTitle = settings.MenuTitle.Trim();
        settings.OpenMode = "proxy";
        var plugin = Plugin.Instance;
        if (plugin is null) return StatusCode(503);
        plugin.UpdateConfiguration(settings);
        sessions.Clear();
        return NoContent();
    }
}
