using MediaBrowser.Model.Plugins;

namespace VibraVidPanel;

public sealed class PluginConfiguration : BasePluginConfiguration
{
    public bool Enabled { get; set; } = true;
    public string MenuTitle { get; set; } = "Scarica film / serie TV";
    public string GuiUrl { get; set; } = string.Empty;
    // Kept for reading 1.0 configuration files; all UI now uses the server proxy.
    public string OpenMode { get; set; } = "proxy";
    public bool OnlyAdministrators { get; set; }
}

public static class SettingsValidation
{
    public static string? GetError(PluginConfiguration configuration)
    {
        if (string.IsNullOrWhiteSpace(configuration.MenuTitle) || configuration.MenuTitle.Trim().Length > 80 ||
            configuration.MenuTitle.Any(char.IsControl))
            return "Il nome della voce deve contenere da 1 a 80 caratteri, su una sola riga.";
        if (string.IsNullOrWhiteSpace(configuration.GuiUrl)) return null;
        if (!Uri.TryCreate(configuration.GuiUrl.Trim(), UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) ||
            string.IsNullOrWhiteSpace(uri.Host) || !string.IsNullOrEmpty(uri.UserInfo) ||
            !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment))
            return "Inserisci un indirizzo HTTP o HTTPS completo, senza credenziali, parametri o frammenti.";
        return null;
    }
}
