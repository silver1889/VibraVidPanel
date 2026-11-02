using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace VibraVidPanel;

public static class GuiRewrite
{
    private static readonly TimeSpan RegexTimeout = TimeSpan.FromSeconds(2);
    private static readonly Regex QuotedRoot = new("(?<q>[\"'`])(?<url>/(?!/)[^\"'`\\s<>\\\\]*)", RegexOptions.CultureInvariant, RegexTimeout);
    private static readonly Regex CssRoot = new("url\\(\\s*(?<q>[\"']?)(?<url>/(?!/)[^\\s)\"']+)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, RegexTimeout);
    private static readonly Regex WebPath = new("^/(?:$|(?:api|static|search|download|downloads|watchlist|settings|logs|schedule|admin|arr-stack|series-detail|series-metadata|login|logout|cinema)(?:[/?#]|$))", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, RegexTimeout);
    private static readonly Regex ExistingBase = new("<base\\b[^>]*>", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, RegexTimeout);
    private static readonly Regex DataFields = new("<textarea\\b[^>]*>.*?</textarea>|<script\\b(?=[^>]*\\btype\\s*=\\s*[\"']application/(?:ld\\+)?json[\"'])[^>]*>.*?</script>|\\b(?:value|placeholder)\\s*=\\s*([\"']).*?\\1", RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.CultureInvariant, RegexTimeout);

    public static string Rewrite(string text, GuiSession session, string prefix, string path, bool html)
    {
        // Filesystem paths in configuration fields are data, even when they
        // begin with a web-route name such as /downloads/.
        var fields = new List<string>();
        var marker = "__VP_DATA_" + Guid.NewGuid().ToString("N") + "_";
        if (html) text = DataFields.Replace(text, match =>
        {
            fields.Add(match.Value);
            return marker + (fields.Count - 1) + "__";
        });
        var upstream = session.Upstream.AbsoluteUri.TrimEnd('/');
        text = text.Replace(upstream + "/", prefix, StringComparison.OrdinalIgnoreCase);
        text = QuotedRoot.Replace(text, match =>
            WebPath.IsMatch(match.Groups["url"].Value) ? match.Groups["q"].Value + prefix + match.Groups["url"].Value[1..] : match.Value);
        text = CssRoot.Replace(text, match =>
            WebPath.IsMatch(match.Groups["url"].Value) ? match.Value[..(match.Groups["url"].Index - match.Index)] + prefix + match.Groups["url"].Value[1..] : match.Value);
        if (!html) return text;
        text = ExistingBase.Replace(text, string.Empty);
        var resource = typeof(Plugin).Assembly.GetManifestResourceStream("VibraVidPanel.Web.proxy-bridge.js")!;
        using var reader = new StreamReader(resource);
        var cookies = string.Join("; ", session.Cookies.GetCookies(session.Upstream).Cast<Cookie>()
            .Where(cookie => !cookie.HttpOnly).Select(cookie => cookie.Name + "=" + cookie.Value));
        var bridge = reader.ReadToEnd().Replace("__VP_PREFIX__", JsonSerializer.Serialize(prefix), StringComparison.Ordinal)
            .Replace("__VP_COOKIE__", JsonSerializer.Serialize(cookies), StringComparison.Ordinal);
        using var confirmationResource = typeof(Plugin).Assembly.GetManifestResourceStream("VibraVidPanel.Web.bulk-confirm.js")!;
        using var confirmationReader = new StreamReader(confirmationResource);
        bridge += "\n" + confirmationReader.ReadToEnd();
        var folder = path.Contains('/') ? path[..(path.LastIndexOf('/') + 1)] : string.Empty;
        // Give the existing GUI's horizontal navigation a full row on phones.
        var mobile = "<style>@media(max-width:640px){.cn-top{flex-wrap:wrap!important;gap:8px!important;padding:12px 18px!important}.cn-menu{order:3!important;flex:0 0 100%!important;width:100%!important}.cn-top-right{margin-left:auto!important}.cn-menu a{padding:8px 12px!important}html.vp-editing .cn-top{position:static!important}html.vp-editing body{padding-bottom:45vh!important}html.vp-keyboard .cn-upd-banner{display:none!important}}</style>";
        var inserted = "<base href=\"" + WebUtility.HtmlEncode(prefix + folder) + "\"><meta name=\"referrer\" content=\"no-referrer\">" + mobile + "<script>" + bridge + "</script>";
        var head = Regex.Match(text, "<head\\b[^>]*>", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, RegexTimeout);
        text = head.Success ? text.Insert(head.Index + head.Length, inserted) : inserted + text;
        for (var index = 0; index < fields.Count; index++)
            text = text.Replace(marker + index + "__", fields[index], StringComparison.Ordinal);
        return text;
    }
}
