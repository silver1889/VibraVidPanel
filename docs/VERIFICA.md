# Verifiche della versione 1.3.1.0

Il codice di questa versione è stato compilato in Release con SDK .NET 9 e
collaudato su Jellyfin Server 10.11.11. Il collaudo originario del 2 novembre
2026 ha superato **80 controlli** tra server, browser e GUI VibraVid 1.4.9.

Sono stati verificati:

- Accesso autenticato, restrizione agli amministratori e revoca delle sessioni.
- GUI incorporata, POST con cookie e CSRF, redirect e progresso.
- Isolamento dalla memoria locale e dai cookie della pagina Jellyfin.
- Pagina standard del plugin, menu web, BaseUrl e viewport mobile con tastiera.
- Attività Jellyfin con utente corretto, film, serie e selezioni raggruppate.
- Conferma interna per serie completa e stagioni selezionate, annullamento,
  Esc, invio singolo e attività singola anche con un doppio clic di conferma.
- Modifiche ripetute delle impostazioni e persistenza delle attività al riavvio.
- Sulla GUI reale: apertura della conferma e annullamento senza inviare download.

I download usati per verificare l'invio sono simulati dalla GUI fittizia. Non
sono stati scaricati film o episodi reali durante il collaudo. La simulazione
del viewport mobile non sostituisce le prove su ogni dispositivo fisico.

La preparazione di questo repository verifica separatamente compilazione,
struttura dei pacchetti, checksum e corrispondenza delle versioni. Il workflow
GitHub di compilazione svolge questi controlli di distribuzione; non esegue
automaticamente l'intero collaudo browser.

Gli output originali delle prove, i profili browser, gli account temporanei,
i database e i dati di installazioni personali non fanno parte del repository.
