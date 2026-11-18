// Ablauf mit Subtasks: Auswahl, Queue, Zeitprotokoll, Erledigt, Bereinigung.
import Plugin from "../src/main";
import { TFile } from "obsidian";
import * as fs from "fs";

let fail = 0;
const ok = (c: boolean, m: string) => {
	if (!c) {
		fail++;
		console.log("FAIL", m);
	}
};

const files = new Map<string, string>();
files.set(".obsidian/daily-notes.json", JSON.stringify({ folder: "40 Daily", format: "YYYY-MM-DD" }));
const P = "23 Tickets/DEV-1564 Zentrale Pipeline anlegen.md";
const Q = "23 Tickets/DEV-1695 Joule.md";
const base = fs.readFileSync(process.cwd() + "/test/fixtures/ticket.md", "utf8");
files.set(
	P,
	base.replace("## Analyse / Lösung", "## Subtasks\n- [ ] Vorlage sichten\n- [ ] Pipeline bauen\n\n## Analyse / Lösung"),
);
files.set(Q, "---\ntyp: ticket\nstatus: offen\nprio: mittel\njira-status: Offen\n---\n# Joule\n\n## Verlauf\n");
const folders = new Set<string>(["23 Tickets", "40 Daily"]);
const fm = (p: string) => {
	const m = files.get(p)!.match(/^---\n([\s\S]*?)\n---/);
	const o: any = {};
	for (const l of (m?.[1] ?? "").split("\n")) {
		const x = l.match(/^([\w-]+):\s*(.*)$/);
		if (x) o[x[1]] = x[2];
	}
	return o;
};
const app: any = {
	vault: {
		configDir: ".obsidian",
		adapter: { read: async (p: string) => files.get(p)! },
		getAbstractFileByPath: (p: string) => (files.has(p) ? new (TFile as any)(p) : folders.has(p) ? { path: p } : null),
		createFolder: async (p: string) => {
			folders.add(p);
		},
		create: async (p: string, c: string) => {
			files.set(p, c);
			return new (TFile as any)(p);
		},
		read: async (f: any) => files.get(f.path)!,
		cachedRead: async (f: any) => files.get(f.path)!,
		process: async (f: any, fn: (s: string) => string) => {
			files.set(f.path, fn(files.get(f.path)!));
		},
		getMarkdownFiles: () => [P, Q].map((p) => new (TFile as any)(p)),
	},
	metadataCache: { getFileCache: (f: any) => ({ frontmatter: fm(f.path) }) },
	workspace: { getLeavesOfType: () => [], onLayoutReady() {}, getActiveFile() { return null; }, on() {} },
};
(globalThis as any).window = { moment: null, setInterval() {} };

(async () => {
	const p: any = new (Plugin as any)(app);
	// Altbestand: ganzes Ticket P in der Queue, Q ohne Subtasks
	p._data = { queue: [P, Q], introShown: true };
	await p.onload();
	await p.refresh();

	const ids: string[] = p.data.queue;
	ok(ids[0] === `${P}::Vorlage sichten` && ids[1] === `${P}::Pipeline bauen` && ids[2] === Q, "ganzes Ticket → Subtasks: " + JSON.stringify(ids));

	const tP = p.ticket(P);
	const tQ = p.ticket(Q);
	ok(p.availableItems(tP).length === 0, "alle Subtasks von P schon in Queue");
	ok(p.availableItems(tQ).length === 0, "Q (ohne Subtasks) als ganzes Ticket in Queue");
	await p.removeFromQueue(`${P}::Pipeline bauen`);
	const av = p.availableItems(tP);
	ok(av.length === 1 && av[0].sub === "Pipeline bauen", "entfernter Subtask wieder auswählbar");
	ok(p.availableTickets().map((t: any) => t.path).join() === P, "Auswahl gruppiert nur Tickets mit freien Einträgen");

	// Zeitblock auf Subtask, dann erledigen
	const cur = p.currentId;
	const start = new Date(2026, 10, 18, 9, 0).getTime();
	const end = new Date(2026, 10, 18, 9, 45).getTime();
	p.data.timers[cur] = { elapsed: 0, startedAt: start };
	const realNow = Date.now;
	(Date as any).now = () => end;
	await p.completeCurrent();
	(Date as any).now = realNow;

	const t = files.get(P)!;
	ok(t.includes("- [x] Vorlage sichten"), "Checkbox abgehakt");
	ok(t.includes("- [ ] Pipeline bauen"), "anderer Subtask offen");
	ok(/^status: offen$/m.test(t), "Ticket-Status bleibt (nur Subtask erledigt)");
	ok(t.includes("- 2026-11-18 09:00–09:45: ⏱ 45m gearbeitet · Vorlage sichten"), "Block mit Subtask im Verlauf");
	ok(/Subtask „Vorlage sichten“ erledigt \(⏱ 45m\)/.test(t), "Erledigt-Zeile");
	const d = files.get("40 Daily/2026-11-18.md") ?? "";
	ok(d.includes("09:00–09:45 [[DEV-1564 Zentrale Pipeline anlegen]] · Vorlage sichten · ⏱ 45m"), "Tagesnotiz mit Subtask: " + d);
	ok(p.data.queue.length === 1 && p.data.queue[0] === Q, "Queue danach: " + JSON.stringify(p.data.queue));

	// Subtask in der Notiz von Hand abgehakt → fliegt beim Einlesen aus der Queue
	await p.addToQueue(`${P}::Pipeline bauen`);
	files.set(P, files.get(P)!.replace("- [ ] Pipeline bauen", "- [x] Pipeline bauen"));
	await p.refresh();
	ok(!p.data.queue.includes(`${P}::Pipeline bauen`), "von Hand abgehakter Subtask entfernt");
	ok(p.availableItems(p.ticket(P)).length === 1 && p.availableItems(p.ticket(P))[0].sub === null, "alle erledigt → ganzes Ticket auswählbar");

	// Umbenennen behält Subtask-Einträge
	await p.addToQueue(`${Q}`);
	p.handleRename = p.handleRename.bind(p);
	files.set("23 Tickets/X.md", files.get(Q)!);
	p["handleRename"]("23 Tickets/X.md", Q);
	ok(p.data.queue.includes("23 Tickets/X.md") && !p.data.queue.includes(Q), "Umbenennen");

	console.log(fail ? fail + " FEHLER" : "Alle Checks OK");
})();
