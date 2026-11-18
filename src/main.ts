import {
	App,
	ItemView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	WorkspaceLeaf,
	debounce,
	setIcon,
} from "obsidian";

const VIEW_QUEUE = "focus-queue-list";
const VIEW_FOCUS = "focus-queue-focus";

interface Settings {
	excludedFolders: string;
	doneStatus: string;
	hiddenStatuses: string;
	logToVerlauf: boolean;
	logBlocks: boolean;
	logToDaily: boolean;
	dailySection: string;
	minBlockMinutes: number;
	setInProgressOnStart: boolean;
	autoStartTimer: boolean;
	focusLocation: "tab" | "sidebar";
	subtaskHeading: string;
}

const DEFAULT_SETTINGS: Settings = {
	excludedFolders: "90 Templates",
	doneStatus: "erledigt",
	hiddenStatuses: "erledigt",
	logToVerlauf: true,
	logBlocks: true,
	logToDaily: true,
	dailySection: "## Zeiterfassung",
	minBlockMinutes: 1,
	setInProgressOnStart: true,
	autoStartTimer: false,
	focusLocation: "tab",
	subtaskHeading: "## Subtasks",
};

export interface Subtask {
	text: string;
	done: boolean;
}

export interface Ticket {
	path: string;
	name: string;
	key: string;
	status: string;
	jiraStatus: string;
	prio: string;
	kunde: string;
	projekt: string;
	link: string;
	faellig: string;
	/** Checkboxen unter „## Subtasks“ (leer, solange die Notiz noch nicht gelesen ist). */
	subtasks: Subtask[];
}

/**
 * Ein Queue-Eintrag ist entweder ein Subtask („Pfad::Subtask-Text“) oder – für Tickets
 * ohne offene Subtasks – das ganze Ticket (nur der Pfad).
 */
export interface QueueItem {
	id: string;
	path: string;
	sub: string | null;
}

export const SUB_SEP = "::";

export function itemId(path: string, sub?: string | null): string {
	return sub ? `${path}${SUB_SEP}${sub}` : path;
}

export function splitItem(id: string): QueueItem {
	const i = id.indexOf(SUB_SEP);
	return i < 0 ? { id, path: id, sub: null } : { id, path: id.slice(0, i), sub: id.slice(i + SUB_SEP.length) };
}

const TASK_LINE = /^(\s*[-*+]\s+\[)(.)(\]\s?)(.*)$/;

function sectionRange(lines: string[], heading: string): [number, number] {
	const start = lines.findIndex((l) => l.trim() === heading.trim());
	if (start < 0) return [-1, -1];
	const level = (heading.trim().match(/^#+/) ?? ["##"])[0].length;
	let end = lines.findIndex((l, i) => {
		if (i <= start) return false;
		const m = l.match(/^(#+)\s/);
		return !!m && m[1].length <= level;
	});
	if (end < 0) end = lines.length;
	return [start, end];
}

/** Liest die Checkboxen unter dem Subtask-Abschnitt. */
export function parseSubtasks(text: string, heading = DEFAULT_SETTINGS.subtaskHeading): Subtask[] {
	const lines = text.split("\n");
	const [s, e] = sectionRange(lines, heading);
	if (s < 0) return [];
	const out: Subtask[] = [];
	for (let i = s + 1; i < e; i++) {
		const m = lines[i].match(TASK_LINE);
		if (!m) continue;
		const t = m[4].trim();
		if (t) out.push({ text: t, done: m[2] !== " " });
	}
	return out;
}

/** Hakt den ersten offenen Subtask mit diesem Text ab. */
export function tickSubtask(text: string, sub: string, heading = DEFAULT_SETTINGS.subtaskHeading): string {
	const lines = text.split("\n");
	const [s, e] = sectionRange(lines, heading);
	if (s < 0) return text;
	for (let i = s + 1; i < e; i++) {
		const m = lines[i].match(TASK_LINE);
		if (m && m[2] === " " && m[4].trim() === sub) {
			lines[i] = `${m[1]}x${m[3]}${m[4]}`;
			return lines.join("\n");
		}
	}
	return text;
}

interface TimerState {
	elapsed: number;
	startedAt: number | null;
}

interface DayStats {
	date: string;
	count: number;
	ms: number;
}

export interface Session {
	path: string;
	start: number;
	end: number;
	sub?: string;
}

interface PluginData {
	pendingLogs: Session[];
	settings: Settings;
	queue: string[]; // Queue-Einträge (siehe QueueItem)
	timers: Record<string, TimerState>; // key = Queue-Eintrag
	today: DayStats;
}

// ---------- helpers (exportiert für Tests) ----------

export function todayStr(): string {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatClock(ms: number): string {
	const s = Math.floor(ms / 1000);
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	const pad = (n: number) => String(n).padStart(2, "0");
	return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function formatDuration(ms: number): string {
	const totalMin = Math.max(1, Math.round(ms / 60000));
	const h = Math.floor(totalMin / 60);
	const m = totalMin % 60;
	if (h === 0) return `${m}m`;
	return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function linkText(v: unknown): string {
	if (Array.isArray(v)) return v.map(linkText).filter(Boolean).join(", ");
	if (typeof v !== "string") return v == null ? "" : String(v);
	return v
		.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
		.replace(/\[\[([^\]]+)\]\]/g, "$1")
		.trim();
}

/** Setzt ein Feld im YAML-Frontmatter zeilenbasiert (Kommentare/Formatierung bleiben erhalten). */
export function setFmField(text: string, field: string, value: string): string {
	if (!text.startsWith("---")) return `---\n${field}: ${value}\n---\n${text}`;
	const end = text.indexOf("\n---", 3);
	if (end < 0) return text;
	let head = text.slice(0, end);
	const rest = text.slice(end);
	const re = new RegExp(`^(${field.replace(/[-]/g, "\\-")}:[ \\t]*)([^#\\n]*?)([ \\t]*#.*)?$`, "m");
	if (re.test(head)) head = head.replace(re, (_m, a, _b, c) => `${a}${value}${c ?? ""}`);
	else head += `\n${field}: ${value}`;
	return head + rest;
}

/** Hängt "- entry" ans Ende eines Abschnitts an (legt ihn am Dateiende an, falls er fehlt). */
export function appendToSection(text: string, heading: string, entry: string): string {
	const lines = text.split("\n");
	const start = lines.findIndex((l) => l.trim() === heading);
	if (start < 0) return text.replace(/\s*$/, "") + `\n\n${heading}\n- ${entry}\n`;
	const level = (heading.match(/^#+/) ?? ["##"])[0].length;
	let end = lines.findIndex((l, i) => {
		if (i <= start) return false;
		const m = l.match(/^(#+)\s/);
		return !!m && m[1].length <= level;
	});
	if (end < 0) end = lines.length;
	let ins = end;
	while (ins > start + 1 && lines[ins - 1].trim() === "") ins--;
	lines.splice(ins, 0, `- ${entry}`);
	return lines.join("\n");
}

/** Hängt eine Zeile an den Abschnitt "## Verlauf" an (legt ihn an, falls er fehlt). */
export function appendVerlauf(text: string, entry: string): string {
	return appendToSection(text, "## Verlauf", entry);
}


export function hhmm(ts: number): string {
	const d = new Date(ts);
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function dateStr(ts: number): string {
	const d = new Date(ts);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Ersetzt {{date}}, {{date:FMT}}, {{time}}, {{time:FMT}}, {{title}} wie die Kern-Vorlagen. */
export function renderTemplate(tpl: string, ts: number, title: string, fmt: (ts: number, f: string) => string): string {
	return tpl
		.replace(/\{\{\s*date(?::([^}]+))?\s*\}\}/g, (_m, f) => fmt(ts, (f ?? "YYYY-MM-DD").trim()))
		.replace(/\{\{\s*time(?::([^}]+))?\s*\}\}/g, (_m, f) => fmt(ts, (f ?? "HH:mm").trim()))
		.replace(/\{\{\s*title\s*\}\}/g, title);
}

const PRIO_ORDER: Record<string, number> = { hoch: 0, mittel: 1, niedrig: 2 };
const STATUS_ORDER: Record<string, number> = { "in Arbeit": 0, offen: 1, wartet: 2 };

// ---------- Plugin ----------

export default class FocusQueuePlugin extends Plugin {
	data!: PluginData;
	tickets = new Map<string, Ticket>();
	statusEl!: HTMLElement;
	private refreshSeq = 0;

	async onload() {
		const loaded = (await this.loadData()) ?? {};
		this.data = {
			settings: Object.assign({}, DEFAULT_SETTINGS, loaded.settings),
			queue: [],
			timers: {},
			today: loaded.today ?? { date: "", count: 0, ms: 0 },
			pendingLogs: loaded.pendingLogs ?? [],
		};
		this.migrate(loaded);

		this.registerView(VIEW_QUEUE, (leaf) => new QueueView(leaf, this));
		this.registerView(VIEW_FOCUS, (leaf) => new FocusView(leaf, this));

		this.addRibbonIcon("list-ordered", "Fokus-Queue öffnen", () => this.openQueue());
		this.addRibbonIcon("target", "Fokus-Modus starten", () => this.startFocus());

		this.statusEl = this.addStatusBarItem();
		this.statusEl.addClass("fq-status");
		this.statusEl.onClickEvent(() => this.startFocus());

		this.addCommand({ id: "open-queue", name: "Queue öffnen", callback: () => this.openQueue() });
		this.addCommand({ id: "start-focus", name: "Fokus-Modus starten", callback: () => this.startFocus() });
		this.addCommand({ id: "toggle-timer", name: "Timer starten/stoppen", callback: () => this.toggleCurrentTimer() });
		this.addCommand({ id: "complete-current", name: "Aktuellen Eintrag erledigen", callback: () => this.completeCurrent() });
		this.addCommand({ id: "skip-current", name: "Aktuellen Eintrag überspringen (ans Ende)", callback: () => this.skipCurrent() });
		this.addCommand({
			id: "add-current-ticket",
			name: "Offene Subtasks der aktuellen Ticket-Notiz zur Queue hinzufügen",
			checkCallback: (checking) => {
				const f = this.app.workspace.getActiveFile();
				const t = f ? this.readTicket(f) : null;
				if (!t) return false;
				if (!checking) this.addTicketToQueue(t.path);
				return true;
			},
		});

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFile) || !this.readTicket(file)) return;
				menu.addItem((i) =>
					i
						.setTitle("Offene Subtasks zur Fokus-Queue hinzufügen")
						.setIcon("list-plus")
						.onClick(() => this.addTicketToQueue(file.path)),
				);
			}),
		);

		this.addSettingTab(new FocusQueueSettingTab(this.app, this));

		const debounced = debounce(() => this.refresh(), 500, true);
		this.app.workspace.onLayoutReady(async () => {
			await this.refresh();
			this.flushLogs();
			this.registerEvent(this.app.metadataCache.on("changed", () => debounced()));
			this.registerEvent(this.app.vault.on("delete", () => debounced()));
			this.registerEvent(
				this.app.vault.on("rename", (file, oldPath) => {
					this.handleRename(file.path, oldPath);
					debounced();
				}),
			);
			if (!loaded.introShown) {
				await this.openQueue();
				(this.data as any).introShown = true;
				await this.save();
			}
		});
		if (loaded.introShown) (this.data as any).introShown = true;

		this.registerInterval(window.setInterval(() => this.tick(), 1000));
	}

	/** Ältere Datenformate übernehmen (v1.0: Objekte mit path). */
	private migrate(loaded: any) {
		const q: unknown[] = loaded.queue ?? [];
		for (const item of q) {
			const id = typeof item === "string" ? item : (item as any)?.path;
			if (id && !this.data.queue.includes(id)) this.data.queue.push(id);
		}
		const timers: Record<string, TimerState> = loaded.timers ?? {};
		for (const [id, t] of Object.entries(timers)) this.data.timers[id] = { ...t };
	}

	onunload() {
		// Laufende Blöcke merken; sie werden beim nächsten Start in die Notizen geschrieben.
		for (const id of Object.keys(this.data.timers)) this.pauseTimer(id, false);
		this.saveData(this.data);
	}

	async save() {
		await this.saveData(this.data);
	}

	get cfg() {
		return this.data.settings;
	}

	get currentId(): string | undefined {
		return this.data.queue[0];
	}

	/** Alias für ältere Aufrufer/Tests. */
	get currentPath(): string | undefined {
		return this.currentId;
	}

	ticket(path: string): Ticket | undefined {
		return this.tickets.get(path);
	}

	item(id: string): QueueItem {
		return splitItem(id);
	}

	/** Anzeigename eines Queue-Eintrags: Subtask-Text bzw. Ticketname. */
	itemTitle(id: string): string {
		const it = splitItem(id);
		return it.sub ?? this.ticketName(it.path);
	}

	ticketName(path: string): string {
		return this.ticket(path)?.name ?? path.split("/").pop()!.replace(/\.md$/, "");
	}

	private list(s: string): string[] {
		return s
			.split(/[,\n]/)
			.map((x) => x.trim())
			.filter(Boolean);
	}

	isHidden(status: string) {
		return this.list(this.cfg.hiddenStatuses).map((s) => s.toLowerCase()).includes((status || "").toLowerCase());
	}

	isDone(t: Ticket) {
		return t.status.toLowerCase() === this.cfg.doneStatus.toLowerCase();
	}

	// ---------- Tickets lesen ----------

	readTicket(file: TFile): Ticket | null {
		if (file.extension !== "md") return null;
		const excluded = this.list(this.cfg.excludedFolders).map((f) => f.replace(/\/+$/, ""));
		if (excluded.some((f) => file.path === f || file.path.startsWith(f + "/"))) return null;
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm || String(fm.typ ?? "").toLowerCase() !== "ticket") return null;
		return {
			path: file.path,
			name: file.basename,
			key: String(fm.jira ?? "").trim(),
			status: String(fm.status ?? "").trim(),
			jiraStatus: String(fm["jira-status"] ?? "").trim(),
			prio: String(fm.prio ?? "").trim(),
			kunde: linkText(fm.kunde),
			projekt: linkText(fm.projekt),
			link: String(fm.link ?? "").trim(),
			faellig: fm.faellig ? String(fm.faellig) : "",
			subtasks: this.tickets.get(file.path)?.subtasks ?? [],
		};
	}

	async refresh() {
		const seq = ++this.refreshSeq;
		const next = new Map<string, Ticket>();
		for (const f of this.app.vault.getMarkdownFiles()) {
			const t = this.readTicket(f);
			if (!t) continue;
			try {
				t.subtasks = parseSubtasks(await this.app.vault.cachedRead(f), this.cfg.subtaskHeading);
			} catch {
				/* Datei gerade nicht lesbar – alten Stand behalten */
			}
			next.set(t.path, t);
		}
		if (seq !== this.refreshSeq) return; // ein neuerer Lauf ist schon unterwegs
		this.tickets = next;
		if (this.cleanQueue()) await this.save();
		this.renderViews();
	}

	/**
	 * Queue bereinigen: gelöschte/erledigte Tickets und erledigte/verschwundene Subtasks entfernen.
	 * Ein ganzes Ticket, das inzwischen offene Subtasks hat, wird durch diese ersetzt.
	 */
	private cleanQueue(): boolean {
		const before = JSON.stringify(this.data.queue);
		const out: string[] = [];
		const push = (id: string) => {
			if (!out.includes(id)) out.push(id);
		};
		for (const id of this.data.queue) {
			const { path, sub } = splitItem(id);
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) continue;
			if (!this.app.metadataCache.getFileCache(file)) {
				push(id); // noch nicht indiziert
				continue;
			}
			const t = this.tickets.get(path);
			if (!t || this.isDone(t)) continue;
			const open = t.subtasks.filter((s) => !s.done);
			if (sub === null) {
				if (open.length === 0) push(id);
				else {
					this.pauseTimer(id);
					for (const s of open) push(itemId(path, s.text));
				}
				continue;
			}
			if (open.some((s) => s.text === sub)) push(id);
		}
		this.data.queue = out;
		return JSON.stringify(out) !== before;
	}

	private handleRename(newPath: string, oldPath: string) {
		let changed = false;
		const move = (id: string) => {
			const it = splitItem(id);
			return it.path === oldPath ? itemId(newPath, it.sub) : id;
		};
		this.data.queue = this.data.queue.map((id) => {
			const n = move(id);
			if (n !== id) changed = true;
			return n;
		});
		for (const id of Object.keys(this.data.timers)) {
			const n = move(id);
			if (n === id) continue;
			this.data.timers[n] = this.data.timers[id];
			delete this.data.timers[id];
			changed = true;
		}
		for (const s of this.data.pendingLogs) if (s.path === oldPath) s.path = newPath;
		if (changed) this.save();
	}

	/** Offene Tickets für die Auswahl (sortiert nach Prio, Status, Name). */
	availableTickets(): Ticket[] {
		return [...this.tickets.values()]
			.filter((t) => !this.isHidden(t.status) && this.availableItems(t).length > 0)
			.sort(
				(a, b) =>
					(PRIO_ORDER[a.prio] ?? 3) - (PRIO_ORDER[b.prio] ?? 3) ||
					(STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3) ||
					a.name.localeCompare(b.name, "de", { numeric: true }),
			);
	}

	/** Auswählbare Einträge eines Tickets: offene Subtasks, sonst das ganze Ticket. */
	availableItems(t: Ticket): QueueItem[] {
		const open = t.subtasks.filter((s) => !s.done);
		const items = open.length ? open.map((s) => splitItem(itemId(t.path, s.text))) : [splitItem(t.path)];
		return items.filter((it) => !this.inQueue(it.id));
	}

	// ---------- Queue ----------

	inQueue(id: string) {
		return this.data.queue.includes(id);
	}

	async addToQueue(id: string, index?: number) {
		if (this.inQueue(id)) {
			new Notice("Eintrag ist schon in der Queue");
			return;
		}
		const i = index === undefined ? this.data.queue.length : Math.max(0, Math.min(index, this.data.queue.length));
		this.data.queue.splice(i, 0, id);
		await this.save();
		this.renderViews();
	}

	/** Alle offenen Subtasks eines Tickets (bzw. das Ticket selbst) ans Ende der Queue. */
	async addTicketToQueue(path: string) {
		const t = this.ticket(path);
		const items = t ? this.availableItems(t) : [];
		if (!items.length) {
			new Notice("Alles von diesem Ticket ist schon in der Queue");
			return;
		}
		this.data.queue.push(...items.map((it) => it.id));
		await this.save();
		this.renderViews();
	}

	async removeFromQueue(id: string) {
		this.pauseTimer(id);
		this.data.queue = this.data.queue.filter((p) => p !== id);
		await this.save();
		this.renderViews();
	}

	async moveInQueue(from: number, to: number) {
		const q = this.data.queue;
		if (from < 0 || from >= q.length) return;
		to = Math.max(0, Math.min(to, q.length - 1));
		if (from === to) return;
		const wasCurrent = q[0];
		const [item] = q.splice(from, 1);
		q.splice(to, 0, item);
		if (wasCurrent && q[0] !== wasCurrent) this.pauseTimer(wasCurrent);
		await this.save();
		this.renderViews();
	}

	async skipCurrent() {
		const cur = this.currentId;
		if (!cur || this.data.queue.length < 2) return;
		this.pauseTimer(cur);
		this.data.queue.push(this.data.queue.shift()!);
		if (this.cfg.autoStartTimer && this.currentId) await this.startTimerFor(this.currentId);
		await this.save();
		this.renderViews();
	}

	async completeCurrent() {
		const id = this.currentId;
		if (!id) {
			new Notice("Keine Einträge in der Queue");
			return;
		}
		const { path, sub } = splitItem(id);
		this.pauseTimer(id);
		await this.flushLogs();
		const ms = this.getElapsed(id);
		const time = ms >= 30000 ? ` (⏱ ${formatDuration(ms)})` : "";
		const file = this.app.vault.getAbstractFileByPath(path);
		let ticketDone = false;
		if (file instanceof TFile) {
			await this.app.vault.process(file, (text) => {
				if (sub !== null) {
					let out = tickSubtask(text, sub, this.cfg.subtaskHeading);
					if (this.cfg.logToVerlauf) out = appendVerlauf(out, `${todayStr()}: Subtask „${sub}“ erledigt${time}`);
					ticketDone = parseSubtasks(out, this.cfg.subtaskHeading).every((s) => s.done);
					return out;
				}
				let out = setFmField(text, "status", this.cfg.doneStatus);
				if (this.cfg.logToVerlauf) {
					const total = ms >= 30000 ? ` (gesamt ⏱ ${formatDuration(ms)})` : "";
					out = appendVerlauf(out, `${todayStr()}: im Fokus-Modus erledigt${total}`);
				}
				return out;
			});
		}

		const today = todayStr();
		if (this.data.today.date !== today) this.data.today = { date: today, count: 0, ms: 0 };
		this.data.today.count += 1;
		this.data.today.ms += ms;

		this.data.queue = this.data.queue.filter((p) => p !== id);
		delete this.data.timers[id];
		const t = this.ticket(path);
		if (t && sub !== null) {
			t.subtasks = t.subtasks.map((s) => (s.text === sub && !s.done ? { ...s, done: true } : s));
		}
		const next = this.currentId;
		if (next && this.cfg.autoStartTimer) await this.startTimerFor(next);
		await this.save();
		this.renderViews();
		const nextLabel = next ? this.itemTitle(next) : "";
		const head = sub !== null && ticketDone ? `✓ Alle Subtasks von ${this.ticketName(path)} erledigt.` : "✓ Erledigt.";
		new Notice(next ? `${head} Weiter mit: ${nextLabel}` : `${head} Die Queue ist leer 🎉`);
	}

	// ---------- Timer ----------

	getElapsed(id: string): number {
		const t = this.data.timers[id];
		if (!t) return 0;
		return t.elapsed + (t.startedAt ? Date.now() - t.startedAt : 0);
	}

	isRunning(id: string): boolean {
		return !!this.data.timers[id]?.startedAt;
	}

	/** Stoppt den Timer; der Arbeitsblock wird protokolliert (async). */
	pauseTimer(id: string, flush = true) {
		const t = this.data.timers[id];
		if (!t?.startedAt) return;
		const now = Date.now();
		const { path, sub } = splitItem(id);
		const session: Session = { path, start: t.startedAt, end: now };
		if (sub !== null) session.sub = sub;
		t.elapsed += now - t.startedAt;
		t.startedAt = null;
		if (this.cfg.logBlocks && session.end - session.start >= this.cfg.minBlockMinutes * 60000) {
			this.data.pendingLogs.push(session);
			if (flush) this.flushLogs();
		}
	}

	private flushing: Promise<void> | null = null;

	/** Schreibt alle ausstehenden Arbeitsblöcke in Ticket-Notiz und Tagesnotiz. */
	flushLogs(): Promise<void> {
		if (this.flushing) {
			// Läuft schon: danach prüfen, ob inzwischen neue Blöcke dazugekommen sind
			return this.flushing.then(() => (this.data.pendingLogs.length ? this.flushLogs() : undefined));
		}
		this.flushing = this.runFlush().finally(() => {
			this.flushing = null;
		});
		return this.flushing;
	}

	private async runFlush() {
		await Promise.resolve();
		try {
			while (this.data.pendingLogs.length) {
				await this.writeSession(this.data.pendingLogs[0]);
				this.data.pendingLogs.shift();
				await this.save();
			}
		} catch (e) {
			console.error("Focus Queue: Zeitprotokoll fehlgeschlagen", e);
			new Notice("Fokus-Queue: Zeit konnte nicht protokolliert werden – nächster Versuch beim nächsten Stopp.");
		}
	}

	private async writeSession(s: Session) {
		const dur = formatDuration(s.end - s.start);
		const span = `${hhmm(s.start)}–${hhmm(s.end)}`;
		const what = s.sub ? ` · ${s.sub}` : "";
		const file = this.app.vault.getAbstractFileByPath(s.path);
		if (file instanceof TFile) {
			await this.app.vault.process(file, (text) =>
				appendVerlauf(text, `${dateStr(s.start)} ${span}: ⏱ ${dur} gearbeitet${what}`),
			);
		}
		if (this.cfg.logToDaily) {
			const daily = await this.getDailyNote(s.start);
			const name = file instanceof TFile ? file.basename : s.path.split("/").pop()!.replace(/\.md$/, "");
			if (daily) {
				await this.app.vault.process(daily, (text) =>
					appendToSection(text, this.cfg.dailySection || "## Zeiterfassung", `${span} [[${name}]]${what} · ⏱ ${dur}`),
				);
			}
		}
	}

	/** Tagesnotiz nach den Einstellungen des Kern-Plugins „Tagesnotizen“ finden oder anlegen. */
	private async getDailyNote(ts: number): Promise<TFile | null> {
		const m = (window as any).moment;
		const fmt = (t: number, f: string) => (m ? m(t).format(f) : dateStr(t));
		let conf: { folder?: string; format?: string; template?: string } = {};
		try {
			conf = JSON.parse(await this.app.vault.adapter.read(`${this.app.vault.configDir}/daily-notes.json`));
		} catch {
			/* Standardwerte */
		}
		const folder = (conf.folder ?? "").replace(/^\/+|\/+$/g, "");
		const base = fmt(ts, conf.format || "YYYY-MM-DD");
		const path = (folder ? `${folder}/` : "") + `${base}.md`;
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) return existing;
		let content = "";
		if (conf.template) {
			const tp = conf.template.endsWith(".md") ? conf.template : `${conf.template}.md`;
			const tf = this.app.vault.getAbstractFileByPath(tp);
			if (tf instanceof TFile) content = renderTemplate(await this.app.vault.read(tf), ts, base, fmt);
		}
		if (folder && !this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
		return await this.app.vault.create(path, content);
	}

	/** Startet den Timer und setzt optional am Ticket status "offen" → "in Arbeit". */
	async startTimerFor(id: string) {
		for (const k of Object.keys(this.data.timers)) if (k !== id) this.pauseTimer(k);
		const t = (this.data.timers[id] ??= { elapsed: 0, startedAt: null });
		if (!t.startedAt) t.startedAt = Date.now();
		const path = splitItem(id).path;
		const tk = this.ticket(path);
		if (this.cfg.setInProgressOnStart && tk && tk.status.toLowerCase() === "offen") {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) await this.app.vault.process(file, (text) => setFmField(text, "status", "in Arbeit"));
		}
	}

	async toggleCurrentTimer() {
		const cur = this.currentId;
		if (!cur) {
			new Notice("Keine Einträge in der Queue");
			return;
		}
		if (this.isRunning(cur)) this.pauseTimer(cur);
		else await this.startTimerFor(cur);
		await this.save();
		this.renderViews();
	}

	async resetTimer(id: string) {
		delete this.data.timers[id]; // bewusst ohne Protokoll
		await this.save();
		this.renderViews();
	}

	// ---------- Views ----------

	async openQueue() {
		await this.activate(VIEW_QUEUE, "sidebar");
	}

	async startFocus() {
		if (!this.currentId) {
			new Notice("Die Queue ist leer – füge zuerst Subtasks hinzu.");
			await this.openQueue();
			return;
		}
		if (this.cfg.autoStartTimer && !this.isRunning(this.currentId)) {
			await this.startTimerFor(this.currentId);
			await this.save();
		}
		await this.activate(VIEW_FOCUS, this.cfg.focusLocation);
		this.renderViews();
	}

	private async activate(type: string, where: "tab" | "sidebar") {
		const ws = this.app.workspace;
		let leaf: WorkspaceLeaf | null = ws.getLeavesOfType(type)[0] ?? null;
		if (!leaf) {
			leaf = where === "sidebar" ? ws.getRightLeaf(false) : ws.getLeaf("tab");
			if (!leaf) leaf = ws.getLeaf("tab");
			await leaf.setViewState({ type, active: true });
		}
		await ws.revealLeaf(leaf);
	}

	renderViews() {
		for (const type of [VIEW_QUEUE, VIEW_FOCUS]) {
			for (const leaf of this.app.workspace.getLeavesOfType(type)) {
				const v = leaf.view;
				if (v instanceof QueueView || v instanceof FocusView) v.render();
			}
		}
		this.updateStatusBar();
	}

	private tick() {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_FOCUS)) {
			if (leaf.view instanceof FocusView) leaf.view.updateTimer();
		}
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_QUEUE)) {
			if (leaf.view instanceof QueueView) leaf.view.updateTimers();
		}
		this.updateStatusBar();
	}

	updateStatusBar() {
		if (!this.statusEl) return;
		const id = this.currentId;
		this.statusEl.empty();
		if (!id) {
			this.statusEl.hide();
			return;
		}
		this.statusEl.show();
		const running = this.isRunning(id);
		this.statusEl.toggleClass("is-running", running);
		setIcon(this.statusEl.createSpan({ cls: "fq-status-icon" }), running ? "timer" : "target");
		let label = this.itemTitle(id);
		if (label.length > 40) label = label.slice(0, 39) + "…";
		this.statusEl.createSpan({ text: ` ${label} · ${formatClock(this.getElapsed(id))}` });
		this.statusEl.setAttr("aria-label", "Fokus-Ansicht öffnen");
	}

	openNote(path: string) {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) this.app.workspace.getLeaf("tab").openFile(file);
	}

	/** Kleine Infozeile: Kunde/Projekt · fällig */
	metaParts(t: Ticket): string[] {
		const parts: string[] = [];
		const kp = [t.kunde, t.projekt].filter(Boolean).join(" / ");
		if (kp) parts.push(kp);
		if (t.faellig) parts.push(`fällig ${t.faellig}`);
		return parts;
	}
}

export function statusTone(status: string): string {
	const s = status.toLowerCase();
	if (/fail|fehler|blocked|blockiert/.test(s)) return "red";
	if (/wart|waiting|on hold/.test(s)) return "orange";
	if (/fertig|done|erledigt|closed|geschlossen|resolved/.test(s)) return "green";
	if (/test|review|deploy|merge|abnahme/.test(s)) return "purple";
	if (/develop|arbeit|progress|umsetzung/.test(s)) return "blue";
	return "gray";
}

/** Gut sichtbarer Status-Chip: Jira-Status, sonst lokaler Status. */
function statusChip(el: HTMLElement, t: Ticket, small = false) {
	const label = t.jiraStatus || t.status;
	if (!label) return;
	const chip = el.createSpan({ cls: `fq-chip fq-tone-${statusTone(label)}${small ? " is-small" : ""}`, text: label });
	chip.setAttr("aria-label", t.jiraStatus ? `Jira-Status: ${t.jiraStatus}` : `Status: ${t.status}`);
}

function prioBadge(el: HTMLElement, prio: string) {
	if (!prio) return;
	el.createSpan({ cls: `fq-prio fq-prio-${prio.toLowerCase()}`, text: prio });
}

// ---------- Queue-Ansicht ----------

class QueueView extends ItemView {
	private search = "";
	private availableEl!: HTMLElement;
	private timerEls = new Map<string, HTMLElement>();
	private dragFrom: number | null = null;
	private dragAdd: string | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: FocusQueuePlugin) {
		super(leaf);
	}

	getViewType() {
		return VIEW_QUEUE;
	}
	getDisplayText() {
		return "Fokus-Queue";
	}
	getIcon() {
		return "list-ordered";
	}

	async onOpen() {
		this.render();
	}

	render() {
		const p = this.plugin;
		const root = this.contentEl;
		const searchHadFocus = document.activeElement?.hasClass("fq-search") ?? false;
		root.empty();
		root.addClass("fq-queue-view");
		this.timerEls.clear();

		const head = root.createDiv("fq-head");
		const startBtn = head.createEl("button", { cls: "mod-cta fq-start" });
		setIcon(startBtn.createSpan("fq-btn-icon"), "target");
		startBtn.createSpan({ text: "Fokus starten" });
		startBtn.onclick = () => p.startFocus();
		const refreshBtn = head.createEl("button", { cls: "clickable-icon fq-icon-btn", attr: { "aria-label": "Neu einlesen" } });
		setIcon(refreshBtn, "refresh-cw");
		refreshBtn.onclick = () => p.refresh();

		const q = p.data.queue;
		root.createEl("h4", { cls: "fq-section", text: `Queue (${q.length})` });
		const list = root.createEl("ol", { cls: "fq-list fq-queue" });
		if (q.length === 0) {
			const empty = list.createEl("li", {
				cls: "fq-empty",
				text: "Noch leer. Füge unten Subtasks mit + hinzu oder ziehe sie hierher.",
			});
			this.dropTarget(empty, () => 0);
		}
		q.forEach((id, i) => this.renderQueueItem(list, id, i));

		root.createEl("h4", { cls: "fq-section", text: "Offene Subtasks" });
		const search = root.createEl("input", {
			type: "search",
			placeholder: "Suchen (Key, Titel, Kunde, Subtask) …",
			cls: "fq-input fq-search",
		});
		search.value = this.search;
		search.addEventListener("input", () => {
			this.search = search.value;
			this.renderAvailable();
		});
		this.availableEl = root.createDiv();
		this.renderAvailable();
		if (searchHadFocus) search.focus();
	}

	/** Ticketzeile: Name (öffnet Notiz) + Jira-Status-Chip, darunter Prio und Infos. */
	private renderTicketHeader(parent: HTMLElement, path: string, cls = "fq-body") {
		const p = this.plugin;
		const t = p.ticket(path);
		const body = parent.createDiv(cls);
		const row = body.createDiv({ cls: "fq-title-row" });
		const title = row.createDiv({ cls: "fq-title" });
		title.createSpan({ text: p.ticketName(path) });
		title.onclick = () => p.openNote(path);
		if (t) statusChip(row, t);
		const meta = body.createDiv("fq-meta");
		if (t) {
			prioBadge(meta, t.prio);
			const parts = p.metaParts(t);
			if (parts.length) meta.createSpan({ cls: "fq-info", text: parts.join(" · ") });
		}
		return meta;
	}

	/** Subtask in der Queue: Subtask-Text, darunter Ticket mit Status und Prio. */
	private renderSubtaskBody(parent: HTMLElement, path: string, sub: string) {
		const p = this.plugin;
		const t = p.ticket(path);
		const body = parent.createDiv("fq-body");
		body.createDiv({ cls: "fq-subtask-text", text: sub });
		const meta = body.createDiv("fq-meta");
		if (t) {
			statusChip(meta, t, true);
			prioBadge(meta, t.prio);
		}
		const src = meta.createSpan({ cls: "fq-info fq-src", text: p.ticketName(path) });
		src.onclick = () => p.openNote(path);
		return meta;
	}

	private renderQueueItem(list: HTMLElement, id: string, i: number) {
		const p = this.plugin;
		const { path, sub } = p.item(id);
		const li = list.createEl("li", { cls: "fq-item" });
		if (i === 0) li.addClass("is-current");
		if (p.isRunning(id)) li.addClass("is-running");
		li.draggable = true;

		setIcon(li.createDiv("fq-handle"), "grip-vertical");
		li.createDiv({ cls: "fq-num", text: String(i + 1) });
		const meta = sub === null ? this.renderTicketHeader(li, path) : this.renderSubtaskBody(li, path, sub);
		const tEl = meta.createSpan({ cls: "fq-time" });
		this.timerEls.set(id, tEl);
		this.setTime(tEl, id);

		const actions = li.createDiv("fq-actions");
		const btn = (icon: string, label: string, fn: () => void) => {
			const b = actions.createDiv({ cls: "clickable-icon", attr: { "aria-label": label } });
			setIcon(b, icon);
			b.onclick = (e) => {
				e.stopPropagation();
				fn();
			};
		};
		btn("arrow-up", "Nach oben", () => p.moveInQueue(i, i - 1));
		btn("arrow-down", "Nach unten", () => p.moveInQueue(i, i + 1));
		btn("x", "Aus Queue entfernen", () => p.removeFromQueue(id));

		li.addEventListener("dragstart", (e) => {
			this.dragFrom = i;
			this.dragAdd = null;
			li.addClass("is-dragging");
			e.dataTransfer?.setData("text/plain", id);
			if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
		});
		li.addEventListener("dragend", () => {
			this.dragFrom = null;
			li.removeClass("is-dragging");
			this.clearDropMarks();
		});
		this.dropTarget(li, (after) => i + (after ? 1 : 0));
	}

	private dropTarget(el: HTMLElement, indexFor: (after: boolean) => number) {
		const isAfter = (e: DragEvent) => {
			const r = el.getBoundingClientRect();
			return e.clientY > r.top + r.height / 2;
		};
		el.addEventListener("dragover", (e) => {
			if (this.dragFrom === null && !this.dragAdd) return;
			e.preventDefault();
			this.clearDropMarks();
			el.addClass(isAfter(e) ? "drop-below" : "drop-above");
		});
		el.addEventListener("dragleave", () => el.removeClass("drop-above", "drop-below"));
		el.addEventListener("drop", (e) => {
			e.preventDefault();
			let to = indexFor(isAfter(e));
			this.clearDropMarks();
			if (this.dragAdd) {
				const id = this.dragAdd;
				this.dragAdd = null;
				this.plugin.addToQueue(id, to);
			} else if (this.dragFrom !== null) {
				const from = this.dragFrom;
				this.dragFrom = null;
				if (from < to) to--;
				this.plugin.moveInQueue(from, to);
			}
		});
	}

	private clearDropMarks() {
		this.contentEl.querySelectorAll(".drop-above, .drop-below").forEach((n) => n.removeClass("drop-above", "drop-below"));
	}

	/** Auswahl: je Ticket eine Gruppe (Status + Prio), darunter die offenen Subtasks. */
	private renderAvailable() {
		const p = this.plugin;
		const el = this.availableEl;
		el.empty();
		const needle = this.search.trim().toLowerCase();
		const groups = p
			.availableTickets()
			.map((t) => {
				const ticketHit = !needle || [t.name, t.kunde, t.projekt, t.key].join(" ").toLowerCase().includes(needle);
				const items = p.availableItems(t).filter((it) => ticketHit || (it.sub ?? "").toLowerCase().includes(needle));
				return { t, items };
			})
			.filter((g) => g.items.length > 0);
		if (groups.length === 0) {
			el.createDiv({ cls: "fq-empty", text: needle ? "Keine Treffer." : "Keine weiteren offenen Subtasks." });
			return;
		}
		for (const { t, items } of groups) {
			const group = el.createDiv("fq-ticket-group");
			const head = group.createDiv("fq-ticket-head");
			this.renderTicketHeader(head, t.path);
			if (items.length > 1) {
				const all = head.createDiv({ cls: "clickable-icon fq-add", attr: { "aria-label": "Alle Subtasks zur Queue hinzufügen" } });
				setIcon(all, "list-plus");
				all.onclick = () => p.addTicketToQueue(t.path);
			}
			const list = group.createEl("ul", { cls: "fq-list fq-available" });
			for (const it of items) this.renderAvailableItem(list, it);
		}
	}

	private renderAvailableItem(list: HTMLElement, it: QueueItem) {
		const p = this.plugin;
		const li = list.createEl("li", { cls: "fq-item fq-avail fq-subtask" });
		li.draggable = true;
		const plus = li.createDiv({ cls: "clickable-icon fq-add", attr: { "aria-label": "Zur Queue hinzufügen" } });
		setIcon(plus, "plus");
		plus.onclick = () => p.addToQueue(it.id);
		li.createDiv({
			cls: "fq-body fq-subtask-text" + (it.sub === null ? " is-whole-ticket" : ""),
			text: it.sub ?? "Ganzes Ticket (keine Subtasks)",
		});
		li.addEventListener("dblclick", () => p.addToQueue(it.id));
		li.addEventListener("dragstart", (e) => {
			this.dragAdd = it.id;
			this.dragFrom = null;
			e.dataTransfer?.setData("text/plain", it.id);
			if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
		});
		li.addEventListener("dragend", () => {
			this.dragAdd = null;
			this.clearDropMarks();
		});
	}

	private setTime(el: HTMLElement, id: string) {
		const ms = this.plugin.getElapsed(id);
		const running = this.plugin.isRunning(id);
		el.setText(ms > 0 || running ? `${running ? "▶ " : ""}${formatClock(ms)}` : "");
	}

	updateTimers() {
		for (const [id, el] of this.timerEls) if (this.plugin.isRunning(id)) this.setTime(el, id);
	}
}

// ---------- Fokus-Ansicht ----------

class FocusView extends ItemView {
	private timerEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: FocusQueuePlugin) {
		super(leaf);
	}

	getViewType() {
		return VIEW_FOCUS;
	}
	getDisplayText() {
		return "Fokus";
	}
	getIcon() {
		return "target";
	}

	async onOpen() {
		this.render();
	}

	render() {
		const p = this.plugin;
		const root = this.contentEl;
		root.empty();
		root.addClass("fq-focus-view");
		this.timerEl = null;

		const wrap = root.createDiv("fq-focus");
		const id = p.currentId;

		if (!id) {
			wrap.createDiv({ cls: "fq-done-big", text: "🎉" });
			wrap.createEl("h2", { text: "Alles erledigt" });
			this.renderToday(wrap);
			const b = wrap.createEl("button", { text: "Queue öffnen", cls: "mod-cta" });
			b.onclick = () => p.openQueue();
			return;
		}
		const { path, sub } = p.item(id);
		const t = p.ticket(path);

		wrap.createDiv({ cls: "fq-label", text: sub !== null ? "Aktueller Subtask" : "Aktuelles Ticket" });
		const title = wrap.createDiv({ cls: "fq-focus-task", text: p.itemTitle(id) });
		title.onclick = () => p.openNote(path);
		if (sub !== null) {
			const tn = wrap.createDiv({ cls: "fq-focus-ticket", text: p.ticketName(path) });
			tn.onclick = () => p.openNote(path);
		}

		const meta = wrap.createDiv("fq-focus-src");
		if (t) {
			statusChip(meta, t);
			prioBadge(meta, t.prio);
			const parts = p.metaParts(t);
			if (parts.length) meta.createSpan({ text: parts.join(" · ") });
			if (sub !== null && t.subtasks.length) {
				const done = t.subtasks.filter((s) => s.done).length;
				meta.createSpan({ cls: "fq-progress", text: `Subtasks ${done}/${t.subtasks.length}` });
			}
		}
		const links = wrap.createDiv("fq-focus-links");
		const open = links.createEl("button", { cls: "fq-link" });
		setIcon(open.createSpan("fq-btn-icon"), "file-text");
		open.createSpan({ text: "Notiz öffnen" });
		open.onclick = () => p.openNote(path);
		if (t?.link) {
			const jira = links.createEl("button", { cls: "fq-link" });
			setIcon(jira.createSpan("fq-btn-icon"), "external-link");
			jira.createSpan({ text: t.key ? `${t.key} in Jira` : "In Jira öffnen" });
			jira.onclick = () => window.open(t.link, "_blank");
		}

		const running = p.isRunning(id);
		this.timerEl = wrap.createDiv({ cls: "fq-clock" + (running ? " is-running" : "") });
		this.updateTimer();

		const btns = wrap.createDiv("fq-focus-btns");
		const mk = (text: string, icon: string, cls: string, fn: () => void) => {
			const b = btns.createEl("button", { cls });
			setIcon(b.createSpan("fq-btn-icon"), icon);
			b.createSpan({ text });
			b.onclick = fn;
		};
		mk(running ? "Stopp" : "Start", running ? "pause" : "play", "fq-btn-timer" + (running ? "" : " mod-cta"), () =>
			p.toggleCurrentTimer(),
		);
		mk("Erledigt", "check", "fq-btn-done", () => p.completeCurrent());

		const small = wrap.createDiv("fq-focus-small");
		const link = (text: string, fn: () => void, disabled = false) => {
			const a = small.createEl("button", { text, cls: "fq-link" });
			a.disabled = disabled;
			a.onclick = fn;
		};
		link("Überspringen", () => p.skipCurrent(), p.data.queue.length < 2);
		link("Timer zurücksetzen", () => p.resetTimer(id));
		link("Queue bearbeiten", () => p.openQueue());

		this.renderToday(wrap);
	}

	private renderToday(wrap: HTMLElement) {
		const t = this.plugin.data.today;
		if (t.date !== todayStr() || t.count === 0) return;
		wrap.createDiv({
			cls: "fq-today",
			text: `Heute erledigt: ${t.count}${t.ms > 0 ? ` · ${formatDuration(t.ms)}` : ""}`,
		});
	}

	updateTimer() {
		const id = this.plugin.currentId;
		if (!this.timerEl || !id) return;
		this.timerEl.setText(formatClock(this.plugin.getElapsed(id)));
	}
}

// ---------- Einstellungen ----------

class FocusQueueSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: FocusQueuePlugin) {
		super(app, plugin);
	}

	display() {
		const { containerEl } = this;
		const p = this.plugin;
		const s = p.cfg;
		containerEl.empty();
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Als Ticket zählt jede Notiz mit „typ: ticket“ im Frontmatter.",
		});

		const saveRefresh = async () => {
			await p.save();
			p.refresh();
		};

		new Setting(containerEl)
			.setName("Ausgeschlossene Ordner")
			.setDesc("Einer pro Zeile oder kommagetrennt.")
			.addTextArea((t) =>
				t.setValue(s.excludedFolders).onChange(async (v) => {
					s.excludedFolders = v;
					await saveRefresh();
				}),
			);
		new Setting(containerEl)
			.setName("Status für „Erledigt“")
			.setDesc("Wird beim Erledigen ins Feld „status“ geschrieben.")
			.addText((t) =>
				t.setValue(s.doneStatus).onChange(async (v) => {
					s.doneStatus = v.trim() || DEFAULT_SETTINGS.doneStatus;
					await saveRefresh();
				}),
			);
		new Setting(containerEl)
			.setName("Ausgeblendete Status")
			.setDesc("Tickets mit diesen Status (und ihre Subtasks) erscheinen nicht in der Auswahl (kommagetrennt), z. B. „erledigt, wartet“.")
			.addText((t) =>
				t.setValue(s.hiddenStatuses).onChange(async (v) => {
					s.hiddenStatuses = v;
					await saveRefresh();
				}),
			);
		new Setting(containerEl)
			.setName("Abschnitt mit Subtasks")
			.setDesc("Checkboxen unter dieser Überschrift erscheinen als auswählbare Subtasks. Tickets ohne offene Subtasks lassen sich als Ganzes auswählen.")
			.addText((t) =>
				t.setValue(s.subtaskHeading).onChange(async (v) => {
					s.subtaskHeading = v.trim() || DEFAULT_SETTINGS.subtaskHeading;
					await saveRefresh();
				}),
			);
		new Setting(containerEl)
			.setName("Erledigt im Verlauf vermerken")
			.setDesc("Beim Erledigen eine Zeile mit der Gesamtzeit unter „## Verlauf“ anhängen.")
			.addToggle((t) =>
				t.setValue(s.logToVerlauf).onChange(async (v) => {
					s.logToVerlauf = v;
					await p.save();
				}),
			);
		new Setting(containerEl)
			.setName("Arbeitsblöcke protokollieren")
			.setDesc("Bei jedem Stopp, Überspringen oder Erledigen eine Zeile „JJJJ-MM-TT HH:MM–HH:MM: ⏱ Dauer gearbeitet“ unter „## Verlauf“ der Ticket-Notiz.")
			.addToggle((t) =>
				t.setValue(s.logBlocks).onChange(async (v) => {
					s.logBlocks = v;
					await p.save();
				}),
			);
		new Setting(containerEl)
			.setName("Auch in die Tagesnotiz schreiben")
			.setDesc("Zeile „HH:MM–HH:MM [[Ticket]] · ⏱ Dauer“ in der Tagesnotiz (Ordner/Format/Vorlage aus dem Kern-Plugin „Tagesnotizen“).")
			.addToggle((t) =>
				t.setValue(s.logToDaily).onChange(async (v) => {
					s.logToDaily = v;
					await p.save();
				}),
			);
		new Setting(containerEl)
			.setName("Abschnitt in der Tagesnotiz")
			.addText((t) =>
				t.setValue(s.dailySection).onChange(async (v) => {
					s.dailySection = v.trim() || DEFAULT_SETTINGS.dailySection;
					await p.save();
				}),
			);
		new Setting(containerEl)
			.setName("Mindestdauer eines Blocks (Minuten)")
			.setDesc("Kürzere Blöcke werden nicht protokolliert (zählen aber zur Gesamtzeit).")
			.addText((t) =>
				t.setValue(String(s.minBlockMinutes)).onChange(async (v) => {
					const n = Number(v.replace(",", "."));
					s.minBlockMinutes = Number.isFinite(n) && n >= 0 ? n : DEFAULT_SETTINGS.minBlockMinutes;
					await p.save();
				}),
			);
		new Setting(containerEl)
			.setName("Status „offen“ → „in Arbeit“ beim Timer-Start")
			.addToggle((t) =>
				t.setValue(s.setInProgressOnStart).onChange(async (v) => {
					s.setInProgressOnStart = v;
					await p.save();
				}),
			);
		new Setting(containerEl)
			.setName("Timer automatisch starten")
			.setDesc("Beim Fokus-Start und für das nächste Ticket nach „Erledigt“.")
			.addToggle((t) =>
				t.setValue(s.autoStartTimer).onChange(async (v) => {
					s.autoStartTimer = v;
					await p.save();
				}),
			);
		new Setting(containerEl).setName("Fokus-Ansicht öffnen in").addDropdown((d) =>
			d
				.addOption("tab", "Eigenem Tab")
				.addOption("sidebar", "Rechter Seitenleiste")
				.setValue(s.focusLocation)
				.onChange(async (v) => {
					s.focusLocation = v as Settings["focusLocation"];
					await p.save();
				}),
		);
	}
}
