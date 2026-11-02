# Compilazione e prove

Servono SDK .NET 9 e Python 3.10 o successivo. `global.json` seleziona un SDK
9.0 compatibile; NuGet ripristina i pacchetti Jellyfin 10.11.11 da nuget.org.

Dalla radice del repository:

```sh
dotnet restore src/VibraVidPanel/VibraVidPanel.csproj
dotnet publish src/VibraVidPanel/VibraVidPanel.csproj -c Release --no-restore -o build
python scripts/package_release.py --output dist
python scripts/verify_release.py dist
```

Su Windows si può usare `py -3` al posto di `python`. Gli ZIP prodotti sono:

- `VibraVidPanel-VERSIONE-Installazione.zip`: cartella plugin, guida e licenze.
- `VibraVidPanel-VERSIONE.zip`: file plugin nella radice, adatto al catalogo.
- `SHA256SUMS.txt`: integrità degli asset prodotti.

Per generare anche il feed della futura release:

```sh
python scripts/package_release.py --output dist --repository NOME-UTENTE/NOME-REPOSITORY
python scripts/verify_release.py dist
```

L'URL nel manifest punta agli asset della release `vVERSIONE`: generarlo non
pubblica file online. Il workflow di pubblicazione usa lo stesso script e
`GITHUB_REPOSITORY` per riempire automaticamente il nome corretto.

## Collaudo completo su Jellyfin reale isolato

Le prove in `tests/proxy_integration.py` avviano una nuova istanza Jellyfin
legata soltanto a `127.0.0.1`, con database e utenti sintetici in `test-output`.
La GUI fittizia non avvia download di contenuti. La suite attuale richiede
Windows, Jellyfin 10.11.11 estratto con `jellyfin.exe` e `jellyfin-web`, FFmpeg,
Node.js con `fetch` disponibile, Playwright e Google Chrome.

Installa Playwright in un ambiente di sviluppo, poi indica i percorsi locali:

```powershell
python tests/proxy_integration.py `
  --jellyfin-dir 'PERCORSO-JELLYFIN' `
  --node 'PERCORSO-NODE-EXE' `
  --node-modules 'PERCORSO-NODE-MODULES' `
  --ffmpeg 'PERCORSO-FFMPEG-EXE'
```

Compila il plugin nella directory `build` prima della prova. La password
`Fixture-password!123` nei test è un valore fittizio per gli account temporanei
e non va usata per un server personale. I token generati dalla suite e i suoi
database rimangono in `test-output`, escluso da Git e dai pacchetti.

## Nuove versioni

Mantieni coerenti la versione in `VibraVidPanel.csproj`, i riferimenti di cache
in `WebEntryMiddleware.cs`, `Web/menu.js` e `Web/panel.html`, README e changelog.
Il GUID del plugin deve restare stabile per preservare configurazioni e
aggiornamenti. Il pacchetto resta legato all'ABI Jellyfin dichiarata.

Gli script di distribuzione includono soltanto una lista esplicita di file
del plugin e documenti; non includono output delle prove o configurazioni locali.
