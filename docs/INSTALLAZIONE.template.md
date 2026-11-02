# VibraVid Panel per Jellyfin

Guida alla prima installazione — versione {{VERSION}}

VibraVid Panel apre la GUI di un'istanza VibraVid dentro Jellyfin. Ricerca,
selezione dei contenuti, download e avanzamento sono gestiti da VibraVid.
Il server Jellyfin inoltra le pagine e le richieste al servizio: il dispositivo
deve raggiungere soltanto Jellyfin, anche quando VibraVid resta nella rete locale.

## 1. Requisiti

- Jellyfin Server **10.11.11**, versione su cui è compilato e collaudato il plugin.
  Non è dichiarata la compatibilità con versioni precedenti o successive.
- Un account amministratore Jellyfin per installare e configurare il plugin.
- VibraVid già installato, con GUI funzionante. Il pacchetto non installa
  VibraVid, Docker o Jellyfin. L'integrazione è stata collaudata con VibraVid 1.4.9.
- Il server Jellyfin deve poter raggiungere la GUI VibraVid tramite HTTP o HTTPS.
- Le cartelle di destinazione dei download devono essere già impostate in VibraVid.

Per aprire il pannello sono supportati Jellyfin Web e le app che visualizzano le
pagine dei plugin Jellyfin. Client con interfaccia propria, come Swiftfin,
Android TV e Roku, possono richiedere un'integrazione dedicata. La sola
installazione del plugin sul server non aggiunge funzioni a tutti i client.

## 2. Contenuto dello ZIP

```text
VibraVidPanel_{{VERSION}}/
  Jellyfin.Plugin.VibraVidPanel.dll
  Jellyfin.Plugin.VibraVidPanel.deps.json
  meta.json
GUIDA-INSTALLAZIONE.md
LEGGIMI.txt
SHA256SUMS.txt
LICENSE
NOTICE.md
SORGENTI.txt
```

Il pacchetto contiene il plugin pronto all'uso e questa guida. Non include
configurazioni personali, credenziali, database, log, profili browser, backup
di installazioni esistenti o dati del collaudo.

## 3. Individuare la cartella plugins

Serve la cartella **plugins del server Jellyfin**, non una cartella sul telefono
o sul PC da cui si guarda il catalogo. Il percorso dipende dall'installazione.

| Installazione | Percorso tipico |
| --- | --- |
| Linux, pacchetto di sistema | `/var/lib/jellyfin/plugins/` |
| Windows, avvio dall'icona nell'area di notifica | `%ProgramData%\Jellyfin\Server\plugins\` |
| Windows, avvio diretto del server | `%LocalAppData%\jellyfin\plugins\` |
| Docker o pacchetto NAS | La cartella `plugins` nella directory dati Jellyfin usata dall'immagine o dal pacchetto |

I percorsi possono essere personalizzati. Per Docker, individua il volume che
contiene i dati persistenti del server e la sua directory `plugins`; puoi copiare
i file nel percorso corrispondente sull'host. Se usi un pacchetto NAS, consulta
i percorsi previsti da quel pacchetto.

Riferimenti: [installazione manuale dei plugin](https://jellyfin.org/docs/general/server/plugins/#manual)
e [directory dati di Jellyfin](https://jellyfin.org/docs/general/administration/configuration/#data-directory).

## 4. Installare il plugin

1. Estrai lo ZIP.
2. Arresta Jellyfin in un momento in cui puoi interrompere il servizio.
3. Copia **l'intera cartella** `VibraVidPanel_{{VERSION}}` nella directory `plugins`.
   I tre file devono trovarsi direttamente dentro questa cartella, senza
   aggiungere un ulteriore livello con lo stesso nome.
4. Assicurati che l'utente che esegue Jellyfin possa leggere i file e attraversare
   la cartella. Su Linux sono normalmente sufficienti permessi 755 per la
   cartella e 644 per i file, con proprietario o gruppo adatti al servizio.
5. Avvia Jellyfin.
6. Con un amministratore, apri **Pannello di controllo → Plugin → Installati**.
   Cerca **VibraVid Panel** e verifica che sia attivo.

Struttura corretta dopo la copia:

```text
plugins/
  VibraVidPanel_{{VERSION}}/
    Jellyfin.Plugin.VibraVidPanel.dll
    Jellyfin.Plugin.VibraVidPanel.deps.json
    meta.json
```

La distribuzione è manuale: lo ZIP non è un repository del catalogo plugin e
non viene installato caricandolo nella pagina dei repository Jellyfin.

## 5. Configurare il collegamento

Apri **Pannello di controllo → Plugin → VibraVid Panel** e imposta:

| Campo | Cosa inserire |
| --- | --- |
| Indirizzo interno del container VibraVid | L'URL della GUI raggiungibile **dal server Jellyfin**, completo di protocollo e porta |
| Voce nel menu | Il nome mostrato nel menu web; inizialmente “Scarica film / serie TV” |
| Mostra la voce nel menu | Abilita il collegamento al pannello |
| Consenti l'accesso solo agli amministratori Jellyfin | Limita l'accesso alla GUI agli amministratori |

Se entrambi i servizi sono nella stessa rete Docker e il servizio si chiama
`vibravid`, un esempio di URL è `http://vibravid:8000/`. Per un servizio su un
altro host, usa `http://NOME-O-IP-DEL-SERVER:PORTA/`, sostituendo i segnaposto.
Usa la porta effettiva della tua installazione.

`localhost` indica l'ambiente in cui gira Jellyfin: se Jellyfin è in un container,
indica quel container. Non indica automaticamente il NAS o un altro container.

L'URL non deve contenere username, password, parametri o frammenti. Non serve
inserire credenziali SSH del NAS o creare una chiave API Jellyfin.

Premi **Salva**, poi **Apri pannello VibraVid**. Dovrebbe apparire la ricerca
della GUI esistente. Puoi cambiare i parametri in seguito dalla stessa pagina o
dal pulsante **Impostazioni** del pannello, disponibile agli amministratori.

## 6. Aprire il pannello e scaricare

- In Jellyfin Web usa **Scarica film / serie TV** nel menu Media.
- Per gli amministratori è disponibile anche la pagina **Scarica film / serie TV**
  nella sezione Server delle pagine plugin.
- Nelle app che supportano queste pagine, apri la voce della sezione Server.
  Le pagine plugin di Jellyfin richiedono un account amministratore.
- Cerca un titolo nella GUI VibraVid e usa i suoi comandi per gestire il download.
  La coda e il progresso sono mostrati dalla GUI VibraVid.
- Usa **← Jellyfin** per tornare al catalogo, **Ricarica** per rinnovare il pannello
  e **Impostazioni** per modificare il collegamento.

I comandi **Download all** e download delle stagioni selezionate chiedono
conferma in una finestra dentro il pannello. **Annulla** o il tasto Esc chiudono
la finestra senza inviare richieste; **Scarica** invia un unico comando alla
coda VibraVid. Non occorre abilitare i popup del browser.

La ricerca avviene nel pannello VibraVid. Il plugin non aggiunge risultati
VibraVid alla ricerca globale Jellyfin né indicatori di download alle copertine
della libreria Jellyfin.

I file vengono salvati nelle cartelle configurate in VibraVid. Per visualizzarli
nel catalogo, tali cartelle devono essere accessibili al server Jellyfin e incluse
nelle sue librerie; successivamente Jellyfin deve eseguire una scansione.

### Registro attività Jellyfin

Da questa versione i download avviati dal pannello vengono registrati anche in
**Pannello di controllo → Attività** di Jellyfin, con l'account che ha inviato
il comando. Non occorre configurare credenziali aggiuntive. Esempi:

- `Mario ha avviato il download con VibraVid di: “Nome film”`
- `Mario ha avviato il download con VibraVid di: “Nome serie” — stagione 2 completa`
- `Mario ha avviato il download con VibraVid di: “Nome serie” — stagioni 1, 3 complete`
- `Mario ha avviato il download con VibraVid di: “Nome serie” — serie completa (tutte le stagioni)`

Una selezione di più episodi genera una sola voce con titolo e stagione, senza
elencare ogni episodio. Ogni comando accettato genera una voce: i successivi
aggiornamenti della coda non creano duplicati. Se si selezionano soltanto alcuni
episodi, il registro indica `episodi selezionati`, senza dichiarare completa
la stagione.

La voce indica che VibraVid ha accettato la richiesta nella sua coda; non
certifica il completamento del download. Le richieste rifiutate non producono
una voce di avvio. Il rilevamento è verificato con la GUI VibraVid 1.4.9.
I download avviati direttamente dalla GUI esterna, dal bot o da automazioni
VibraVid non sono attribuibili a un account Jellyfin e non vengono registrati
da questo plugin. Le attività precedenti all'installazione non vengono importate.

Il registro usa le normali autorizzazioni e la conservazione delle attività
Jellyfin; è consultabile dagli amministratori. Contiene nome utente e titolo
richiesto, senza credenziali o indirizzi del container.

## 7. Uso fuori dalla rete locale

Configura nell'app o nel browser l'indirizzo **HTTPS remoto di Jellyfin**.
L'indirizzo interno VibraVid nelle impostazioni del plugin può restare locale:
è Jellyfin a usarlo. Non occorre pubblicare su Internet la porta di VibraVid.

Se Jellyfin usa un reverse proxy o un prefisso URL, il proxy deve inoltrare
anche i percorsi del plugin insieme alle normali richieste Jellyfin. Un prefisso
configurato sul server viene gestito dal plugin.

Gli utenti del pannello usano le funzioni dell'istanza VibraVid collegata. Il
plugin non crea account VibraVid separati per ogni utente Jellyfin. Configura
l'opzione per soli amministratori in base a chi deve poter gestire i download.

## 8. Risoluzione dei problemi

| Problema | Controllo da eseguire |
| --- | --- |
| Il plugin non compare tra gli installati | Verifica versione Jellyfin, struttura della cartella, permessi e riavvio del server; consulta i log Jellyfin |
| La voce non compare nel menu | Controlla che sia abilitata, il tipo di client e l'account usato; ricarica il web o chiudi completamente e riapri l'app |
| Il pannello chiede di configurare l'indirizzo | Apri le impostazioni sul server Jellyfin corretto, inserisci l'URL interno e salva |
| Jellyfin non raggiunge VibraVid | Verifica dal server o dalla rete del suo container protocollo, nome host, porta e raggiungibilità della GUI |
| Il pannello è scaduto o mostra una pagina vecchia | Premi Ricarica; dopo un aggiornamento usa Ctrl+F5 nel browser o riapri l'app |
| La ricerca invia la richiesta ma il sito non restituisce risultati | Verifica il provider e la configurazione in VibraVid; confronta il comportamento della sua GUI diretta nella rete locale |
| Il download termina ma il titolo non compare in Jellyfin | Controlla percorso finale, accesso ai file, libreria associata e scansione Jellyfin |

## 9. Aggiornamento e rimozione

Per aggiornare, arresta Jellyfin, conserva la vecchia cartella del plugin
**fuori da `plugins`** e copia la nuova versione. Mantieni il file
`plugins/configurations/Jellyfin.Plugin.VibraVidPanel.xml` per conservare il
collegamento e le preferenze. Riavvia il server e ricarica il client.

Per rimuovere il plugin, arresta Jellyfin e rimuovi soltanto la sua cartella
`VibraVidPanel_{{VERSION}}`, poi riavvia. Conservando l'XML potrai riutilizzare
i parametri in una successiva installazione.

L'aggiornamento di VibraVid è separato da quello di questo plugin e va gestito
secondo le istruzioni del progetto: [documentazione VibraVid](https://github.com/AstraeLabs/VibraVid).
