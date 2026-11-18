# Focus Queue – Obsidian-Plugin

Tickets aus dem Vault in eine Reihenfolge bringen und im Fokus-Modus eins nach dem anderen mit Timer abarbeiten.

## Funktionen (Stand 1.3.0)
- **Auswahl (rechte Seitenleiste):** offene Subtasks (Checkboxen unter `## Subtasks`) aller Notizen mit `typ: ticket`, gruppiert nach Ticket. Jede Gruppe zeigt Jira-Status als farbigen Chip, Prio-Badge, Kunde/Projekt und Fälligkeit. Tickets ohne offene Subtasks sind als „Ganzes Ticket“ wählbar.
- **Queue:** Subtasks per +, Doppelklick oder Drag & Drop hinzufügen und sortieren.
- **Fokus-Modus:** zeigt den aktuellen Subtask groß mit seinem Ticket, Timer (Start/Stopp), „Erledigt“ und „Überspringen“. Links zur Notiz und zu Jira.
- **Erledigt:** hakt den Subtask in der Notiz ab und vermerkt ihn unter `## Verlauf` (bei ganzem Ticket: `status: erledigt` mit Gesamtzeit).
- **Subtasks anlegen:** macht der Jira-Sync (`.scripts/jira-sync/jira_sync.py --needs-subtasks` / `--add-subtasks`), siehe die geplanten Sync-Tasks in der Claude-App.
- **Zeitprotokoll:** Jeder Arbeitsblock (Start → Stopp/Überspringen/Erledigt) wird als Zeile in die Ticket-Notiz (`## Verlauf`) und in die Tagesnotiz (`## Zeiterfassung`) geschrieben.
- **Statusleiste:** aktuelles Ticket + laufende Zeit, Klick öffnet den Fokus-Modus.
- Daten (Reihenfolge, Timer) liegen in `.obsidian/plugins/focus-queue/data.json` des Vaults.

## Entwicklung
```bash
npm install
npm run build      # Typecheck + Bundle nach dist/
npm test           # Tests mit gemockter Obsidian-API
scripts/install.sh "/Users/patrickschwendemann/Documents/Obsidian Vault"
```

Quellcode: `src/main.ts`, Styles: `styles.css`, Plugin-Metadaten: `manifest.json`.

## Versionierung
- Jede Änderung ist ein eigener Commit, jede ausgelieferte Version bekommt ein Tag `vX.Y.Z` (Version in `manifest.json` und `package.json` gleichziehen, Eintrag in `CHANGELOG.md`).
- Zurück zu einer früheren Version: `git checkout vX.Y.Z && scripts/install.sh "<Vault>"`.
