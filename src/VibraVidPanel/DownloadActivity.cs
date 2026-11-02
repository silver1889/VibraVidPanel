using System.Globalization;
using System.Text;
using System.Text.Json;
using Jellyfin.Database.Implementations.Entities;
using MediaBrowser.Model.Activity;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Primitives;

namespace VibraVidPanel;

/// <summary>Observe accepted GUI commands, never the per-episode queue or polling.</summary>
public sealed class DownloadActivity(IActivityManager activities, ILogger<DownloadActivity> logger)
{
    private const int MaximumFormBytes = 128 * 1024;

    public async Task<DownloadIntent?> ReadIntent(HttpRequest request, string path)
    {
        if (!HttpMethods.IsPost(request.Method) || path is not ("download/" or "series-detail/") ||
            !string.Equals(request.ContentType?.Split(';')[0].Trim(), "application/x-www-form-urlencoded", StringComparison.OrdinalIgnoreCase) ||
            request.ContentLength > MaximumFormBytes) return null;

        // Buffer only these small forms and rewind even when parsing fails. The
        // upstream must receive exactly the same bytes as before observation.
        request.EnableBuffering();
        try
        {
            using var buffer = new MemoryStream();
            var chunk = new byte[8192];
            while (buffer.Length <= MaximumFormBytes)
            {
                var count = await request.Body.ReadAsync(chunk, request.HttpContext.RequestAborted).ConfigureAwait(false);
                if (count == 0) break;
                buffer.Write(chunk, 0, count);
            }
            if (buffer.Length > MaximumFormBytes) return null;
            var form = QueryHelpers.ParseQuery(Encoding.UTF8.GetString(buffer.ToArray()));
            return Parse(form, path);
        }
        catch (Exception error) when (error is not OperationCanceledException)
        {
            logger.LogWarning("VibraVid Panel: lettura attività non riuscita ({Type})", error.GetType().Name);
            return null;
        }
        finally { request.Body.Position = 0; }
    }

    private static DownloadIntent? Parse(Dictionary<string, StringValues> form, string path)
    {
        string Value(string key) => form.TryGetValue(key, out var value) && value.Count == 1 ? value.ToString().Trim() : string.Empty;
        if (Value("source_alias").Length == 0 || Value("item_payload").Length == 0) return null;
        using var payload = JsonDocument.Parse(Value("item_payload"), new JsonDocumentOptions { MaxDepth = 16 });
        var item = payload.RootElement;
        if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty("name", out var name) || name.ValueKind != JsonValueKind.String) return null;
        var title = Clean(name.GetString() ?? string.Empty, 300);
        if (title.Length == 0) return null;
        var type = item.TryGetProperty("type", out var kind) && kind.ValueKind == JsonValueKind.String ? kind.GetString()?.ToLowerInvariant() : null;
        if (type is "song" or "track" or "music" or "album" or "live") return null;
        var movie = type is "movie" or "film" || item.TryGetProperty("is_movie", out var flag) && flag.ValueKind == JsonValueKind.True;
        if (path == "download/" && movie) return new(title, string.Empty);

        var command = Value("download_type");
        if (path == "series-detail/")
        {
            // A plain POST here opens the details, rather than starting a job.
            return command switch
            {
                "full_series" => new(title, "serie completa (tutte le stagioni)"),
                "full_season" when Season(Value("season_number")) is { } season => new(title, "stagione " + season + " completa"),
                "selected_seasons" when Seasons(Value("selected_seasons")) is { } seasons => new(title, seasons),
                "episodes" when Season(Value("season_number")) is { } season && Value("selected_episodes").Length > 0 =>
                    new(title, "stagione " + season + (Value("selected_episodes") == "*" ? " completa" : " (episodi selezionati)")),
                _ => null
            };
        }
        var selection = Value("season");
        var episodes = Value("episode");
        if (selection == "*" && episodes == "*") return new(title, "serie completa (tutte le stagioni)");
        if (Season(selection) is { } number)
            return new(title, "stagione " + number + (episodes == "*" ? " completa" : " (episodi selezionati)"));
        return new(title, "serie TV");
    }

    private static string? Season(string value) => int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var number) && number >= 0
        ? number.ToString(CultureInfo.InvariantCulture) : null;

    private static string? Seasons(string value)
    {
        var parts = value.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length is 0 or > 100) return null;
        var numbers = parts.Select(Season).ToArray();
        if (numbers.Any(number => number is null)) return null;
        var distinct = numbers.Distinct().OrderBy(number => int.Parse(number!, CultureInfo.InvariantCulture)).ToArray();
        return distinct.Length == 1 ? "stagione " + distinct[0] + " completa" : "stagioni " + string.Join(", ", distinct) + " complete";
    }

    public async Task Record(DownloadIntent? intent, HttpResponseMessage response, Uri target, Uri upstream, Guid userId, string username)
    {
        if (intent is null || userId == Guid.Empty || (int)response.StatusCode is not (302 or 303) || response.Headers.Location is not { } location) return;
        var redirect = location.IsAbsoluteUri ? location : new Uri(target, location);
        // VibraVid 1.4.9 redirects accepted commands to downloads/. Validation
        // failures redirect to search/details, and must never produce an event.
        if (redirect.Scheme != upstream.Scheme || redirect.Authority != upstream.Authority ||
            redirect.AbsolutePath != new Uri(upstream, "downloads/").AbsolutePath) return;
        var content = "“" + intent.Title + "”" + (intent.Scope.Length == 0 ? string.Empty : " — " + intent.Scope);
        try
        {
            await activities.CreateAsync(new ActivityLog(Clean(Clean(username, 100) + " ha avviato il download con VibraVid di: " + content, 512),
                "VibraVidDownloadStarted", userId)
            {
                Overview = "Richiesta accettata da VibraVid e inserita nella coda. Il completamento si verifica nel pannello Download di VibraVid.",
                LogSeverity = LogLevel.Information
            }).ConfigureAwait(false);
        }
        catch (Exception error)
        {
            // An activity-store failure must not turn an accepted download into
            // a failed form submission, which could trigger a duplicate retry.
            logger.LogError("VibraVid Panel: registrazione attività non riuscita ({Type})", error.GetType().Name);
        }
    }

    private static string Clean(string value, int maximum)
    {
        var text = new StringBuilder();
        foreach (var rune in value.EnumerateRunes())
        {
            if (Rune.GetUnicodeCategory(rune) is UnicodeCategory.Control or UnicodeCategory.Format or UnicodeCategory.LineSeparator or UnicodeCategory.ParagraphSeparator) continue;
            if (text.Length + rune.Utf16SequenceLength > maximum) break;
            text.Append(rune.ToString());
        }
        return text.ToString().Trim();
    }
}

public sealed record DownloadIntent(string Title, string Scope);
