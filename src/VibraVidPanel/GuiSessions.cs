using System.Collections.Concurrent;
using System.Net;
using System.Security.Cryptography;

namespace VibraVidPanel;

public sealed class GuiSession : IDisposable
{
    public required string Ticket { get; init; }
    public required string AuthToken { get; init; }
    public required Uri Upstream { get; init; }
    public DateTimeOffset Created { get; } = DateTimeOffset.UtcNow;
    public DateTimeOffset LastUsed { get; set; } = DateTimeOffset.UtcNow;
    public CookieContainer Cookies { get; } = new();
    public HttpClient Client { get; }

    public GuiSession()
    {
        Client = new HttpClient(new HttpClientHandler
        {
            AllowAutoRedirect = false,
            AutomaticDecompression = DecompressionMethods.All,
            CookieContainer = Cookies,
            UseCookies = true,
            UseProxy = false
        }) { Timeout = TimeSpan.FromMinutes(2) };
    }

    public void Dispose() => Client.Dispose();
}

public sealed class GuiSessions : IDisposable
{
    private readonly ConcurrentDictionary<string, GuiSession> _sessions = new(StringComparer.Ordinal);
    private readonly object _gate = new();

    public GuiSession Create(string authToken, Uri upstream)
    {
        lock (_gate)
        {
            foreach (var item in _sessions.Values.ToArray())
                if (Expired(item)) Remove(item.Ticket);
            var owned = _sessions.Values.Where(item => item.AuthToken == authToken).OrderBy(item => item.Created).ToArray();
            foreach (var item in owned.Take(Math.Max(0, owned.Length - 3))) Remove(item.Ticket);
            if (_sessions.Count >= 128) throw new InvalidOperationException("Troppe sessioni attive.");
            var session = new GuiSession { Ticket = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant(),
                AuthToken = authToken, Upstream = upstream };
            _sessions[session.Ticket] = session;
            return session;
        }
    }

    public GuiSession? Get(string ticket)
    {
        if (ticket.Length != 64 || !_sessions.TryGetValue(ticket, out var session)) return null;
        if (Expired(session)) { Remove(ticket); return null; }
        session.LastUsed = DateTimeOffset.UtcNow;
        return session;
    }

    private static bool Expired(GuiSession session) =>
        DateTimeOffset.UtcNow - session.Created > TimeSpan.FromHours(12) ||
        DateTimeOffset.UtcNow - session.LastUsed > TimeSpan.FromMinutes(30);

    public void Remove(string ticket)
    {
        if (_sessions.TryRemove(ticket, out var session)) session.Dispose();
    }

    public void Clear()
    {
        foreach (var ticket in _sessions.Keys) Remove(ticket);
    }

    public void Dispose() => Clear();
}
