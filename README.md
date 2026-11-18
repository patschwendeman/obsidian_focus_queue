# Focus Queue – Obsidian-Plugin

Tickets aus dem Vault in eine Reihenfolge bringen und im Fokus-Modus eins nach dem anderen mit Timer abarbeiten.

## Funktionen (Stand 1.2.0)
- **Queue (rechte Seitenleiste):** alle Notizen mit `typ: ticket`, die nicht erledigt sind. Per Drag & Drop oder Pfeilen sortieren. Jira-Status als farbiger Chip, Prio-Badge, Kunde/Projekt und Fälligkeit.
- **Fokus-Modus:** zeigt das aktuelle Ticket groß, mit Timer (Start/Stopp), „Erledigt“ und „Überspringen“. Links zur Notiz und zu Jira.
- **Erledigt:** setzt `status: erledigt` im Frontmatter und vermerkt die Gesamtzeit unter `## Verlauf`.
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
