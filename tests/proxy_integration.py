"""End-to-end test against an isolated, loopback-only Jellyfin and a fake GUI.

No production containers, NAS services or provider downloads are accessed.
"""
import argparse
import datetime
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import threading
import time
import urllib.error
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]
PLUGIN_ID = "76d721a9-6529-4f75-a2d5-d9a15fd2cf93"
AUTH_HEADER = 'MediaBrowser Client="VibraVid Panel Test", Device="Loopback", DeviceId="vibravid-panel-lab", Version="1.0.0"'


def port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def request(base, path, data=None, token=None, method=None, headers=None):
    req_headers = {"Authorization": AUTH_HEADER, **(headers or {})}
    if token:
        req_headers["X-Emby-Token"] = token
    body = None if data is None else json.dumps(data).encode()
    if body is not None:
        req_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(base + path, data=body, headers=req_headers, method=method)
    try:
        response = urllib.request.urlopen(req, timeout=20)
    except urllib.error.HTTPError as exc:
        response = exc
    with response:
        raw = response.read()
        try:
            value = json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            value = raw
        return response.status, value, dict(response.headers)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--jellyfin-dir", type=Path, required=True)
    parser.add_argument("--node", required=True)
    parser.add_argument("--node-modules", required=True)
    parser.add_argument("--ffmpeg", required=True)
    args = parser.parse_args()
    lab = ROOT / "test-output" / datetime.datetime.now(datetime.timezone.utc).strftime("lab-%Y%m%dT%H%M%SZ")
    for folder in ("data", "config", "cache", "logs"):
        (lab / folder).mkdir(parents=True, exist_ok=True)
    version = ET.parse(ROOT / "src/VibraVidPanel/VibraVidPanel.csproj").getroot().findtext("PropertyGroup/Version")
    destination = lab / ("data/plugins/VibraVidPanel_" + version)
    destination.mkdir(parents=True)
    for name in ("Jellyfin.Plugin.VibraVidPanel.dll", "Jellyfin.Plugin.VibraVidPanel.deps.json"):
        shutil.copy2(ROOT / "build" / name, destination / name)
    server_port = port()
    base = f"http://127.0.0.1:{server_port}"
    (lab / "config/network.xml").write_text(
        f'<NetworkConfiguration><InternalHttpPort>{server_port}</InternalHttpPort>'
        f'<PublicHttpPort>{server_port}</PublicHttpPort><EnableIPv4>true</EnableIPv4>'
        '<EnableIPv6>false</EnableIPv6><EnableRemoteAccess>false</EnableRemoteAccess>'
        '<AutoDiscovery>false</AutoDiscovery><EnableUPnP>false</EnableUPnP><EnableHttps>false</EnableHttps>'
        '<LocalNetworkAddresses><string>127.0.0.1</string></LocalNetworkAddresses></NetworkConfiguration>',
        encoding="utf-8",
    )
    downloads = []

    class FakeGui(BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'
        def do_GET(self):
            if self.path.startswith('/api/'):
                body = json.dumps({'progress':43,'output_path':'/downloads/Film','url':'/downloads/'}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
            elif self.path == '/static/app.css':
                body = b'body{background:#13131b;color:white;font:18px system-ui;padding:24px}input,button{font:inherit;padding:10px}a{color:#b898ff;margin-right:15px}'
                self.send_response(200)
                self.send_header('Content-Type','text/css')
            elif self.path == '/static/app.js':
                body = b"fetch('/api/status/').then(r=>r.json()).then(d=>{document.querySelector('#progress').textContent=d.progress+'%';window.fixtureData=d});sessionStorage.setItem('fixture','ok');document.querySelector('#storage').textContent=sessionStorage.getItem('fixture');try{parent.localStorage.getItem('jellyfin_credentials');document.querySelector('#isolation').textContent='unsafe'}catch(e){document.querySelector('#isolation').textContent='isolato'}"
                self.send_response(200)
                self.send_header('Content-Type','application/javascript')
            else:
                content = '<form action="/search/" method="GET"><label>Cerca <input name="query" value="Film di prova"></label><button>Cerca</button></form>'
                if self.path.startswith('/search/'):
                    content = '<h2>Risultati</h2><form method="POST" action="/download/"><input type="hidden" name="csrfmiddlewaretoken" value="fixture-csrf"><button>Scarica sul NAS di prova</button></form>'
                elif self.path == '/downloads/':
                    content = '<h2>In coda sul NAS di prova</h2>'
                elif self.path == '/series-detail/':
                    content = (ROOT/'tests/bulk-fixture.html').read_text(encoding='utf-8')
                body = ('<!doctype html><html lang="it"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>VibraVid - GUI di prova</title><link rel="stylesheet" href="/static/app.css"></head><body><h1>VibraVid</h1><p>GUI di prova isolata: nessun download reale.</p><a href="/">Ricerca</a><a href="/downloads/">Download</a><a href="/series-detail/">Serie di prova</a>' + content + '<input id="fixture-folder" value="/downloads/Film"><textarea id="fixture-config">{"path":"/downloads/Film"}</textarea><script id="fixture-json" type="application/json">{"path":"/downloads/Film"}</script><p id="progress"></p><p id="storage"></p><p id="isolation"></p><script src="/static/app.js"></script></body></html>').encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header('Set-Cookie','csrftoken=fixture-csrf; Path=/; SameSite=Lax')
                self.send_header('Set-Cookie','sessionid=upstream-only; Path=/; HttpOnly')
                self.send_header("X-Frame-Options", "DENY")
                self.send_header('Content-Security-Policy', "frame-ancestors 'none'")
            self.send_header("Content-Length", str(len(body)))
            self.send_header('Connection','close')
            self.close_connection = True
            self.end_headers()
            try: self.wfile.write(body)
            except (BrokenPipeError,ConnectionAbortedError): pass

        def do_POST(self):
            data = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode()
            expected_origin = 'http://' + self.headers['Host']
            valid = 'csrfmiddlewaretoken=fixture-csrf' in data and 'csrftoken=fixture-csrf' in self.headers.get('Cookie','') and self.headers.get('Origin') == expected_origin
            if valid:
                downloads.append({"body": data, "jellyfin_token_forwarded": "X-Emby-Token" in self.headers or 'Authorization' in self.headers})
            body = b'' if valid else b'CSRF failed'
            form = urllib.parse.parse_qs(data)
            outcome = form.get('fixture_outcome', ['accepted'])[0]
            code = 500 if valid and outcome == 'server_error' else 302 if valid else 403
            self.send_response(code)
            if code == 302: self.send_header('Location','/' if outcome == 'validation_error' else '/downloads/')
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header('Connection','close')
            self.close_connection = True
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_):
            pass

    gui = ThreadingHTTPServer(("127.0.0.1", 0), FakeGui)
    gui_url = f"http://127.0.0.1:{gui.server_port}/"
    threading.Thread(target=gui.serve_forever, daemon=True).start()
    log = (lab / "server.log").open("wb")
    server_command = [
        str(args.jellyfin_dir / "jellyfin.exe"), "--datadir", str(lab / "data"),
        "--configdir", str(lab / "config"), "--cachedir", str(lab / "cache"),
        "--logdir", str(lab / "logs"), "--webdir", str(args.jellyfin_dir / "jellyfin-web"),
        "--ffmpeg", args.ffmpeg, "--nonetchange", "--service",
    ]
    process = subprocess.Popen(server_command, stdout=log, stderr=subprocess.STDOUT, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    checks = []

    def check(name, condition):
        assert condition, name
        checks.append(name)
        print("PASS " + name, flush=True)

    try:
        for _ in range(100):
            if process.poll() is not None:
                raise RuntimeError("Jellyfin exited: " + (lab / "server.log").read_text(errors="replace")[-6000:])
            try:
                status, _, _ = request(base, "/System/Info/Public")
                if status == 200 and request(base, "/Startup/User")[0] == 200:
                    break
            except (OSError, urllib.error.URLError):
                pass
            time.sleep(1)
        else:
            raise RuntimeError("Jellyfin startup timed out")
        print("Isolated Jellyfin ready", flush=True)
        status, _, _ = request(base, "/Startup/User", {"Name": "panel-admin", "Password": "Fixture-password!123"})
        check("startup user", status in (200, 204))
        request(base, "/Startup/Configuration", {"ServerName":"Jellyfin · Prova VibraVid", "UICulture": "it-IT", "MetadataCountryCode": "IT", "PreferredMetadataLanguage": "it"})
        request(base, "/Startup/RemoteAccess", {"EnableRemoteAccess": False, "EnableAutomaticPortMapping": False})
        request(base, "/Startup/Complete", method="POST")
        status, auth, _ = request(base, "/Users/AuthenticateByName", {"Username": "panel-admin", "Pw": "Fixture-password!123"})
        check("admin authentication", status == 200)
        token = auth["AccessToken"]
        status, created, _ = request(base, "/Users/New", {"Name": "panel-user", "Password": "Fixture-password!123"}, token)
        check("normal user created", status == 200)
        status, normal, _ = request(base, "/Users/AuthenticateByName", {"Username": "panel-user", "Pw": "Fixture-password!123"})
        check("normal user authentication", status == 200)
        user_token = normal["AccessToken"]
        for title, kind in (("Film", "movies"), ("Serie TV", "tvshows")):
            request(base, f"/Library/VirtualFolders?name={title.replace(' ', '%20')}&collectionType={kind}&refreshLibrary=false", {"LibraryOptions": {}}, token)
        status, plugins, _ = request(base, "/Plugins", token=token)
        check("plugin loaded by real Jellyfin", status == 200 and any(p["Id"].replace("-", "") == PLUGIN_ID.replace("-", "") for p in plugins))
        status, page, headers = request(base, "/web/index.html", headers={"Accept-Encoding": "gzip, br", "If-None-Match": '"old"'})
        check("web loader injected once", status == 200 and page.count(b'id="vibravid-panel-loader"') == 1)
        check("HTML content length preserved", int(headers["Content-Length"]) == len(page))
        check("HTML loader cache disabled", headers.get("Cache-Control") == "no-store")
        check("assets public", request(base, "/VibraVidPanel/assets/menu.js")[0] == 200)
        check("unknown asset rejected", request(base, "/VibraVidPanel/assets/config.html")[0] == 404)
        check("client settings require authentication", request(base, "/VibraVidPanel/client")[0] == 401)
        check("normal user receives client settings", request(base, "/VibraVidPanel/client", token=user_token)[0] == 200)
        settings = {"Enabled": True, "GuiUrl": gui_url, "MenuTitle": "Scarica film / serie TV", "OpenMode": "proxy", "OnlyAdministrators": False}
        check("normal user cannot change settings", request(base, "/VibraVidPanel/settings", settings, user_token)[0] == 403)
        for invalid in ("javascript:alert(1)", "http://name:password@localhost:8000/", "http://localhost:8000/?token=secret", "http://localhost:8000/#fragment"):
            check("unsafe URL rejected " + invalid.split(":")[0] + str(len(checks)), request(base, "/VibraVidPanel/settings", {**settings, "GuiUrl": invalid}, token)[0] == 400)
        check("admin saves settings", request(base, "/VibraVidPanel/settings", settings, token)[0] == 204)
        status, actual, _ = request(base, "/VibraVidPanel/client", token=user_token)
        check("LAN URL not exposed in client settings", status == 200 and actual['Configured'] and 'GuiUrl' not in actual)
        check('settings readable only by administrator', request(base,'/VibraVidPanel/settings',token=user_token)[0] == 403)
        check('session creation requires authentication',request(base,'/VibraVidPanel/session',method='POST')[0] == 401)
        status, lease, _ = request(base,'/VibraVidPanel/session',token=user_token,method='POST')
        check('authenticated user creates GUI session',status==200)
        check('unknown GUI session rejected',request(base,'/VibraVidPanel/gui/'+'a'*64+'/')[0]==401)
        status, html, headers = request(base,lease['Url'])
        check('upstream DENY framing replaced by isolated panel',status==200 and 'X-Frame-Options' not in headers and 'sandbox' in headers.get('Content-Security-Policy',''))
        check('HTML form actions point through Jellyfin',lease['Url'].encode()+b'search/' in html)
        check('upstream cookies not set in Jellyfin browser', 'Set-Cookie' not in headers)
        request(base,'/VibraVidPanel/session/'+lease['Ticket'],token=user_token,method='DELETE')
        check('closed session rejected',request(base,lease['Url'])[0]==401)
        check("administrator-only mode saves", request(base, "/VibraVidPanel/settings", {**settings, "OnlyAdministrators": True}, token)[0] == 204)
        check("administrator-only mode enforced server-side", request(base, "/VibraVidPanel/client", token=user_token)[0] == 403)
        request(base, "/VibraVidPanel/settings", settings, token)
        activity_checks = []
        def activity_check(name, condition):
            check(name, condition)
            activity_checks.append(name)

        def entries():
            status, data, _ = request(base, '/System/ActivityLog/Entries?limit=500', token=token)
            assert status == 200
            return [entry for entry in data['Items'] if entry['Type'] == 'VibraVidDownloadStarted']

        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args): return None

        def command(lease, fields, route='series-detail/', valid_csrf=True):
            form = {'csrfmiddlewaretoken': 'fixture-csrf' if valid_csrf else 'invalid',
                    'source_alias': 'fixture', 'item_payload': json.dumps({'name': 'Serie di prova', 'type': 'tv', 'is_movie': False}), **fields}
            body = urllib.parse.urlencode(form).encode()
            req = urllib.request.Request(base + lease['Url'] + route, data=body,
                headers={'Content-Type':'application/x-www-form-urlencoded'}, method='POST')
            try: response = urllib.request.build_opener(NoRedirect).open(req, timeout=20)
            except urllib.error.HTTPError as error: response = error
            with response: return response.status, body.decode()

        _, user_lease, _ = request(base, '/VibraVidPanel/session', token=user_token, method='POST')
        _, admin_lease, _ = request(base, '/VibraVidPanel/session', token=token, method='POST')
        request(base, user_lease['Url'])
        request(base, admin_lease['Url'])
        movie = json.dumps({'name':'Film di prova: città & stelle', 'type':'movie', 'is_movie':True})
        status, original = command(user_lease, {'item_payload':movie, 'username':'panel-admin', 'userId':auth['User']['Id']}, 'download/')
        logs = entries()
        activity_check('accepted movie produces one persistent activity', status == 302 and len(logs) == 1 and 'Film di prova: città & stelle' in logs[0]['Name'])
        activity_check('activity uses authenticated user, ignoring forged form identity', logs[0]['Name'].startswith('panel-user ha avviato') and logs[0]['UserId'].replace('-','') == normal['User']['Id'].replace('-',''))
        activity_check('activity observation preserves the original upstream body', downloads[-1]['body'] == original)
        activity_check('activity marks queue acceptance rather than completion', 'Richiesta accettata' in logs[0]['Overview'])
        command(admin_lease, {'download_type':'full_season','season_number':'2'})
        logs = entries()
        activity_check('whole season produces one activity with administrator identity', len(logs) == 2 and any('panel-admin ha avviato' in e['Name'] and 'stagione 2 completa' in e['Name'] and e['UserId'].replace('-','') == auth['User']['Id'].replace('-','') for e in logs))
        command(user_lease, {'download_type':'episodes','season_number':'3','selected_episodes':'1-12'})
        logs = entries()
        activity_check('episode batch produces one series activity without episode titles', len(logs) == 3 and any('Serie di prova' in e['Name'] and 'stagione 3 (episodi selezionati)' in e['Name'] and '1-12' not in e['Name'] for e in logs))
        command(user_lease, {'download_type':'full_series'})
        activity_check('all seasons produce a single complete-series activity', len(entries()) == 4 and any('serie completa (tutte le stagioni)' in e['Name'] for e in entries()))
        command(user_lease, {'download_type':'selected_seasons','selected_seasons':'3,1,3'})
        activity_check('selected seasons are grouped in a single activity', len(entries()) == 5 and any('stagioni 1, 3 complete' in e['Name'] for e in entries()))
        command(user_lease, {'season':'4','episode':'*'}, 'download/')
        activity_check('legacy whole-season form is recorded once', len(entries()) == 6 and any('stagione 4 completa' in e['Name'] for e in entries()))
        before = len(entries())
        command(user_lease, {})  # Opening details is not a download.
        command(user_lease, {'download_type':'episodes','season_number':'3','selected_episodes':''})
        command(user_lease, {'download_type':'full_season','season_number':'2','fixture_outcome':'validation_error'})
        command(user_lease, {'download_type':'full_season','season_number':'2','fixture_outcome':'server_error'})
        command(user_lease, {'item_payload':movie}, 'download/', valid_csrf=False)
        command(user_lease, {'item_payload':'invalid-json'}, 'download/')
        command(user_lease, {'download_type':'full_series'}, 'series-metadata/')
        for _ in range(3): request(base, user_lease['Url']+'api/get-downloads/')
        activity_check('details, metadata, polling and failed submissions create no activity', len(entries()) == before)
        command(user_lease, {'item_payload':json.dumps({'name':'Titolo\ncon\u202e controlli', 'is_movie':True})}, 'download/')
        activity_check('activity titles cannot insert control characters', len(entries()) == before + 1 and any('Titolocon controlli' in e['Name'] for e in entries()))
        command(user_lease, {'item_payload':json.dumps({'name':'🌟' * 350, 'is_movie':False}),
                             'download_type':'selected_seasons','selected_seasons':','.join(map(str, range(100)))})
        activity_check('long Unicode names and season lists respect the activity database limit', len(entries()) == before + 2 and
            all(len(e['Name'].encode('utf-16le')) // 2 <= 512 for e in entries()))
        activity_check('ordinary users cannot read the administrator activity log', request(base, '/System/ActivityLog/Entries', token=user_token)[0] == 403)
        for lease in (user_lease, admin_lease):
            owner = user_token if lease is user_lease else token
            request(base, '/VibraVidPanel/session/'+lease['Ticket'], token=owner, method='DELETE')
        context = {"base": base, "guiUrl": gui_url, "adminToken": token, "userToken": user_token,
                   "password": "Fixture-password!123", "lab": str(lab), "nodeModules": args.node_modules}
        (lab / "context.json").write_text(json.dumps(context), encoding="utf-8")
        result = subprocess.run([args.node, str(ROOT / "tests/proxy-browser.cjs"), str(lab / "context.json")], timeout=180, capture_output=True, text=True, encoding='utf-8', errors='replace')
        print(result.stdout, end="", flush=True)
        if result.returncode:
            raise RuntimeError(result.stderr + result.stdout[-4000:])
        check("GUI form submitted through server proxy with CSRF", bool(downloads))
        check("Jellyfin token not forwarded to GUI", all(not item["jellyfin_token_forwarded"] for item in downloads))
        expected_activities = len(entries())
        request(base, "/VibraVidPanel/settings", settings, token)
        # This process belongs exclusively to the disposable test lab. Do not
        # rely on the server's delayed shutdown API to restart the local fixture.
        process.terminate()
        process.wait(timeout=10)
        network = ET.parse(lab / "config/network.xml")
        base_url = network.getroot().find("BaseUrl")
        if base_url is None:
            base_url = ET.SubElement(network.getroot(), "BaseUrl")
        base_url.text = "/fixture"
        network.write(lab / "config/network.xml", encoding="utf-8", xml_declaration=True)
        process = subprocess.Popen(server_command, stdout=log, stderr=subprocess.STDOUT, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        prefixed_base = base + "/fixture"
        for _ in range(60):
            try:
                if request(prefixed_base, "/VibraVidPanel/client", token=user_token)[0] == 200:
                    break
            except (OSError, urllib.error.URLError):
                pass
            time.sleep(1)
        else:
            raise RuntimeError("Jellyfin restart with BaseUrl timed out")
        status, prefixed_html, _ = request(prefixed_base, "/web/index.html")
        persisted_status, persisted, _ = request(prefixed_base, '/System/ActivityLog/Entries?limit=500', token=token)
        activity_check('download activities persist across a Jellyfin restart', persisted_status == 200 and
            len([e for e in persisted['Items'] if e['Type'] == 'VibraVidDownloadStarted']) == expected_activities)
        check("BaseUrl loader uses prefixed asset URL", status == 200 and b'src="/fixture/VibraVidPanel/assets/menu.js' in prefixed_html)
        check("BaseUrl static asset reachable", request(prefixed_base, "/VibraVidPanel/assets/menu.js")[0] == 200)
        context.update({"base": prefixed_base, "prefixOnly": True})
        (lab / "prefix-context.json").write_text(json.dumps(context), encoding="utf-8")
        result = subprocess.run([args.node, str(ROOT / "tests/proxy-browser.cjs"), str(lab / "prefix-context.json")], timeout=80, capture_output=True, text=True, encoding='utf-8', errors='replace')
        print(result.stdout, end="", flush=True)
        if result.returncode:
            raise RuntimeError(result.stderr + result.stdout[-4000:])
        report = {"jellyfin": "10.11.11", "checks": checks, "browser": json.loads((lab / "browser-report.json").read_text()),
                  "pluginVersion": version, "activityChecks": activity_checks,
                  "browserPrefix": json.loads((lab / "browser-prefix-report.json").read_text()),
                  "real_provider_downloads": 0, "nas_access": False}
        (lab / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        (ROOT / "test-output/latest.json").write_text(json.dumps({"lab": str(lab), "passed": True}), encoding="utf-8")
        print("REPORT " + str(lab / "report.json"), flush=True)
    finally:
        process.terminate()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        gui.shutdown()
        log.close()


if __name__ == "__main__":
    main()
