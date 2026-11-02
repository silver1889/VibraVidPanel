using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace VibraVidPanel;

public sealed class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public Plugin(IApplicationPaths paths, IXmlSerializer serializer) : base(paths, serializer) => Instance = this;

    public static Plugin? Instance { get; private set; }
    public override string Name => "VibraVid Panel";
    public override string Description => "GUI VibraVid dentro Jellyfin, tramite connessione del server al container.";
    public override Guid Id => Guid.Parse("76d721a9-6529-4f75-a2d5-d9a15fd2cf93");

    public IEnumerable<PluginPageInfo> GetPages() =>
    [
        new() { Name = "VibraVidPanel", DisplayName = "VibraVid Panel · Impostazioni", EmbeddedResourcePath = "VibraVidPanel.Web.config.html" },
        new() { Name = "VibraVidDownloads", DisplayName = "Scarica film / serie TV", EnableInMainMenu = true,
            MenuSection = "server", MenuIcon = "download", EmbeddedResourcePath = "VibraVidPanel.Web.panel.html" }
    ];
}
