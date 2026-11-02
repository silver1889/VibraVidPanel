# Caricare questa cartella su GitHub

## 1. Creare il repository

Su GitHub crea un repository pubblico, per esempio
`jellyfin-plugin-vibravid-panel`. Puoi lasciare vuote le opzioni per generare
README, licenza e `.gitignore`: sono già inclusi qui.

Apri **Add file → Upload files** e carica **il contenuto** di questa cartella.
Nella radice del repository devono comparire direttamente `README.md`, `src`,
`docs`, `scripts`, `tests`, `release-assets` e `.github`, senza una cartella
aggiuntiva che li racchiuda. Conferma il caricamento con **Commit changes**.

Assicurati di includere anche `.github/workflows`, `.gitignore` e
`.gitattributes`. Se il selettore nasconde i file che iniziano con un punto,
usa GitHub Desktop o abilita la visualizzazione dei file nascosti.

La cartella contiene meno di 100 file; ogni file è molto inferiore al limite
di caricamento tramite browser. Il nome del repository può essere diverso
dall'esempio: gli script ricavano il nome effettivo da GitHub Actions.

## 2. Distribuzione manuale immediata

I pacchetti **1.3.1.0** sono già nella cartella `release-assets`. Il link del
README allo ZIP per l'installazione manuale funziona anche prima di creare una
release. La directory `src` contiene il codice corrispondente.

## 3. Prima release e catalogo Jellyfin

1. Carica anche i workflow e apri la scheda **Actions** del repository.
2. Se necessario, abilita Actions per il repository.
3. Seleziona **Pubblica release**, poi **Run workflow** sul ramo principale.
4. Attendi il completamento: il workflow compila il progetto, verifica i
   pacchetti e crea la release `v1.3.1.0` con ZIP, checksum e `manifest.json`.
5. L'URL del feed da aggiungere a Jellyfin sarà:

   ```text
   https://github.com/NOME-UTENTE/NOME-REPOSITORY/releases/latest/download/manifest.json
   ```

Sostituisci i due segnaposto con il tuo account e il nome del repository.
Non servono IP del server, password, chiavi SSH o token personali: la
pubblicazione usa il token temporaneo fornito da GitHub Actions.

Il workflow richiede il permesso **contents: write** per creare la release.
Se una regola dell'organizzazione lo impedisce, verifica le impostazioni Actions
del repository. La normale compilazione su push e pull request usa soltanto
il permesso di lettura.

Una release o un tag già esistenti non vengono sovrascritti: per una nuova versione occorre
incrementare il numero del progetto e aggiornare changelog e riferimenti di cache.
Il feed `latest` contiene la versione della release più recente; il ramo del
repository non viene modificato dal workflow.

La release viene resa pubblica soltanto dopo aver caricato tutti gli asset.
Se il caricamento fallisce, può restare una bozza nella sezione Releases:
controllala prima di ripetere la pubblicazione.

## 4. Aggiornamenti futuri

Aggiorna versione e changelog, esegui le prove descritte in `SVILUPPO.md`, poi
avvia nuovamente **Pubblica release**. Gli utenti che hanno aggiunto il feed
possono vedere la nuova versione nel catalogo Jellyfin compatibile.

La compilazione su Actions non avvia un server Jellyfin né esegue download.
Il collaudo browser completo richiede l'ambiente locale descritto nella guida
di sviluppo.

Riferimenti: [caricamento dei file su GitHub](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository),
[plugin Jellyfin](https://jellyfin.org/docs/general/server/plugins/).
