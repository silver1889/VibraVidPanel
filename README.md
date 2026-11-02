# VibraVid Panel per Jellyfin

Plugin non ufficiale per aprire la GUI di [VibraVid](https://github.com/AstraeLabs/VibraVid)
dentro [Jellyfin](https://jellyfin.org/). Il server Jellyfin inoltra pagine e
richieste al servizio VibraVid: il plugin funziona anche al di fuori di una rete LAN.
Preferibile usare un indirizzo https.

## Funzioni

- Voce **Scarica film / serie TV** nel menu web e pagina standard del plugin.
- Ricerca e gestione dei download attraverso la GUI VibraVid esistente.
- Coda e avanzamento mostrati da VibraVid.
- Registro attività Jellyfin con utente, titolo e stagione o serie completa:
  una voce per richiesta, senza una voce per ogni episodio del batch.
- Adattamento del pannello alla tastiera del telefono.
- Conferma interna per **Download all** e stagioni selezionate, con **Annulla**
  e **Scarica**, senza dipendere dai popup del browser.

## Requisiti

- **Jellyfin Server 10.11.11** e un account amministratore per installare e
  configurare il plugin.
- **VibraVid già installato e funzionante**, tramite **installazione locale**
  sul PC/server **oppure** in un **container Docker**, anche su NAS.
  In entrambe le modalità la **GUI web di VibraVid deve essere attiva**.
- La GUI VibraVid deve essere raggiungibile tramite HTTP o HTTPS dal
  **server Jellyfin**: il suo indirizzo va inserito nelle impostazioni del plugin.
- Le cartelle di destinazione per film e serie devono essere già configurate
  in VibraVid, con i permessi necessari per salvare i download.

Installa e configura VibraVid prima di configurare il collegamento nel plugin.

## Compatibilità verificata

| Componente | Versione / supporto |
| --- | --- |
| Jellyfin Server | **10.11.11**, .NET 9 |
| GUI VibraVid | **1.4.9**, già installata e funzionante |
| Client | Jellyfin Web; app che visualizzano le pagine standard dei plugin |
| Versione del plugin | **1.3.1.0** |

La pagina standard dei plugin richiede un amministratore Jellyfin. Gli altri
utenti possono usare il collegamento nel menu Jellyfin Web se consentito nelle
impostazioni. Swiftfin, Android TV, Roku e altri client con interfaccia propria
richiedono supporto specifico: non è dichiarata compatibilità universale.

## Installazione rapida

1. Scarica lo [ZIP per l'installazione manuale](release-assets/VibraVidPanel-1.3.1.0-Installazione.zip?raw=true).
2. Arresta Jellyfin e copia la cartella `VibraVidPanel_1.3.1.0` dello ZIP nella
   directory `plugins` del server.
3. Avvia Jellyfin e apri **Pannello di controllo → Plugin → VibraVid Panel**.
4. Inserisci l'URL VibraVid raggiungibile dal **server Jellyfin**, per esempio
   `http://vibravid:8000/` se i container condividono la rete, e salva.
5. Apri **Scarica film / serie TV**.

La [guida completa](GUIDA-INSTALLAZIONE.md) contiene percorsi, permessi, accesso
remoto, aggiornamento e risoluzione dei problemi. Dopo la prima release GitHub,
gli stessi pacchetti saranno disponibili anche nella sezione **Releases**.

## Catalogo Jellyfin

Il workflow **Pubblica release** genera automaticamente un `manifest.json` con
gli URL del repository in cui viene eseguito. Dopo aver pubblicato una release,
aggiungi in **Plugin → Repository** questo indirizzo:

```text
https://github.com/silver1889/VibraVidPanel/releases/latest/download/manifest.json
```

Il feed diventa disponibile dopo la prima esecuzione riuscita del workflow.
Il pacchetto per il catalogo ha i file del plugin nella radice dello ZIP; quello
per l'installazione manuale contiene anche la cartella da copiare e la guida.

## Come funziona

Le sessioni del pannello sono create dopo il login Jellyfin e ogni richiesta
verifica l'autorizzazione. Il server gestisce i cookie VibraVid e mantiene la
GUI incorporata isolata dalla pagina, dai cookie e dalla memoria locale di
Jellyfin. Le credenziali Jellyfin non vengono inoltrate a VibraVid.

Gli utenti condividono le funzioni dell'istanza VibraVid collegata. I download
usano le sue cartelle configurate; per mostrare i file nel catalogo Jellyfin
occorre includerle nelle librerie e farne eseguire la scansione.

La ricerca avviene nel pannello dedicato. L'integrazione nella ricerca globale
e gli indicatori sulle copertine della libreria Jellyfin non sono implementati.
Il registro attività riguarda i comandi accettati dal pannello, non certifica
il completamento e non importa attività precedenti o avviate da bot esterni.

## Sviluppo e pubblicazione

- [Compilazione e prove](docs/SVILUPPO.md)
- [Caricamento su GitHub e prima release](docs/PUBBLICAZIONE.md)
- [Changelog](CHANGELOG.md)
- [Verifiche della versione](docs/VERIFICA.md)
- [Licenza GPL-3.0](LICENSE) e [attribuzioni](NOTICE.md)

VibraVid Panel è un progetto indipendente e non è un plugin ufficiale di
Jellyfin o VibraVid.
