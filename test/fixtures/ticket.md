---
typ: ticket
jira: DEV-1564
aliases: [DEV1564]
link: https://ruffconsult.atlassian.net/browse/DEV-1564
projekt: ""
kunde: ""
status: offen
prio: hoch
fokuswoche: 2026-47
erstellt: 2026-09-01
faellig: 
jira-status: Offen
---
# DEV-1564 Zentrale Pipeline anlegen

## Beschreibung
- Zentrale CI/CD-Pipeline für ruff consult (Parent: DEV-1167 ruff_consult)
- Repo-Variablen müssen nicht mehr pro Projekt übertragen werden, Setup wird deutlich schneller
- Deployment direkt aus dem Repo: auf `development` wählbar „Deployment auf Dev“ / „Deployment auf Test“, auf `main` „Deployment auf Prod“
- Pipelines: Development, feature/bugfix-Branch, main/production (kommt später)
- Vorlage: Pipeline-YAML der Syna (Kommentar von Christian Hansmann in Jira, 01.09.)

## Unteraufgaben
- [ ] Template Pipeline welche in Projekte integriert wird und die zentrale Pipeline importiert (DEV-1570)

## Analyse / Lösung
-

## Nächste Schritte
- [ ] Zentrale Pipeline (DEV-1564) aufsetzen – Syna-Vorlage aus Jira als Basis

## Verlauf
- 2026-09-01: in Jira angelegt
- 2026-11-17: aus Jira übernommen (Fokuswoche 2026-47)
