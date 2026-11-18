# Changelog

Die Versionen vor 1.2.0 sind aus dem Entwicklungsverlauf rekonstruiert; ihr Code ist nicht im Repo enthalten (das Repo startet mit 1.2.0).

## 1.3.0 – 2026-11-18
- Queue auf Subtask-Ebene: Die Auswahl in der Seitenleiste zeigt die offenen Subtasks (Checkboxen unter `## Subtasks`) gruppiert nach Ticket, mit Jira-Status-Chip und Prio je Gruppe. Einzeln per +, Doppelklick oder Ziehen hinzufügen, alle Subtasks eines Tickets per Listen-Knopf.
- Tickets ohne offene Subtasks bleiben als „Ganzes Ticket“ auswählbar.
- „Erledigt“ hakt den Subtask in der Notiz ab und vermerkt ihn im Verlauf; das Ticket selbst bleibt offen. Sind alle Subtasks erledigt, meldet das ein Hinweis.
- Zeitprotokoll nennt den Subtask (Verlauf und Tagesnotiz).
- Ganze Tickets aus älteren Queues werden beim Einlesen durch ihre offenen Subtasks ersetzt; von Hand abgehakte Subtasks verschwinden aus der Queue.
- Neue Einstellung: Überschrift des Subtask-Abschnitts.

## 1.2.0 – 2026-11-17
- Zeitprotokoll pro Arbeitsblock in Ticket-Notiz (`## Verlauf`) und Tagesnotiz (`## Zeiterfassung`, Tagesnotiz wird bei Bedarf aus der Vorlage angelegt).
- Laufende Blöcke beim Schließen von Obsidian werden beim nächsten Start nachgetragen.
- Einstellungen: Blöcke protokollieren, Tagesnotiz, Abschnittsname, Mindestdauer.

## 1.1.1 – 2026-11-17
- Jira-Status als farbiger Chip neben dem Titel (Queue, Auswahl, Fokus-Modus).

## 1.1.0 – 2026-11-17
- Queue auf Ticket-Ebene: Notizen mit `typ: ticket` statt einzelner Checkboxen.
- „Erledigt“ setzt `status: erledigt`, Timer-Start setzt optional „offen“ → „in Arbeit“.

## 1.0.x – 2026-11-17
- Fokus-Screen vereinfacht (nur „Aktueller Task“, keine Vorschau der nächsten Tasks, größere Darstellung).
- Queue öffnet sich beim ersten Start automatisch.

## 1.0.0 – 2026-11-17
- Erste Version: offene Markdown-Tasks aus dem Vault sammeln, Queue mit Drag & Drop, Fokus-Modus mit Timer, Statusleiste.
