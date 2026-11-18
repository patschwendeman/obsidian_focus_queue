import Plugin, { renderTemplate, appendToSection } from "../src/main";
import { TFile } from "obsidian";
import * as fs from "fs";
const files = new Map<string,string>();
const tpl = `---\ntyp: daily\ndatum: {{date:YYYY-MM-DD}}\n---\n# {{date:dddd, DD.MM.YYYY}}\n\n## Fokus heute\n- \n\n## Erledigt\n- [ ] \n`;
files.set("90 Templates/Daily.md", tpl);
files.set(".obsidian/daily-notes.json", JSON.stringify({folder:"40 Daily",template:"90 Templates/Daily",format:"YYYY-MM-DD"}));
const tk = fs.readFileSync(process.cwd() + "/test/fixtures/ticket.md","utf8");
files.set("23 Tickets/DEV-1564 Zentrale Pipeline anlegen.md", tk);
const fobj = (p:string)=> files.has(p) ? new (TFile as any)(p) : (p==="40 Daily"? {path:p}:null);
let folders = new Set<string>(["23 Tickets","90 Templates"]);
const app:any = { vault: {
  configDir: ".obsidian",
  adapter: { read: async (p:string)=> files.get(p)! },
  getAbstractFileByPath: (p:string)=> files.has(p)? new (TFile as any)(p) : folders.has(p)? {path:p}: null,
  createFolder: async (p:string)=> { folders.add(p); },
  create: async (p:string,c:string)=> { files.set(p,c); return new (TFile as any)(p); },
  read: async (f:any)=> files.get(f.path)!,
  process: async (f:any, fn:(s:string)=>string)=> { files.set(f.path, fn(files.get(f.path)!)); },
  getMarkdownFiles: ()=> [], },
  metadataCache: { getFileCache: ()=>({frontmatter:{typ:"ticket",status:"offen"}}) },
  workspace: { getLeavesOfType: ()=>[], onLayoutReady(){}, getActiveFile(){return null}, on(){} }, 
 };
(globalThis as any).window = { moment: null, setInterval(){} };
(async () => {
  const p:any = new (Plugin as any)(app);
  p._data = { queue: ["23 Tickets/DEV-1564 Zentrale Pipeline anlegen.md"] };
  await p.onload();
  const path = p.data.queue[0];
  // simulate a 65 min block 09:15-10:20 local
  const start = new Date(2026,10,18,9,15).getTime(), end = new Date(2026,10,18,10,20).getTime();
  p.data.timers[path] = { elapsed: 0, startedAt: start };
  const realNow = Date.now; (Date as any).now = () => end;
  p.pauseTimer(path); await p.flushLogs();
  // tiny block (<1 min) must not be logged
  p.data.timers[path].startedAt = end; (Date as any).now = () => end + 20000; p.pauseTimer(path); await p.flushLogs();
  // second block then complete
  p.data.timers[path].startedAt = new Date(2026,10,18,14,0).getTime(); (Date as any).now = () => new Date(2026,10,18,14,30).getTime();
  await p.completeCurrent();
  (Date as any).now = realNow;
  console.log("=== Ticket Verlauf"); const t = files.get(path)!; console.log(t.slice(t.indexOf("## Verlauf"))); console.log(t.match(/^status:.*$/m)![0]);
  console.log("=== Daily"); console.log(files.get("40 Daily/2026-11-18.md"));
  console.log("pending:", p.data.pendingLogs.length, "queue:", p.data.queue.length);
  const d = files.get("40 Daily/2026-11-18.md") ?? "";
  const checks: [boolean,string][] = [
    [t.includes("- 2026-11-18 09:15–10:20: ⏱ 1h 05m gearbeitet"), "Block 1 im Verlauf"],
    [t.includes("- 2026-11-18 14:00–14:30: ⏱ 30m gearbeitet"), "Block 2 im Verlauf"],
    [/im Fokus-Modus erledigt \(gesamt ⏱ 1h 35m\)/.test(t), "Erledigt-Zeile mit Gesamtzeit"],
    [/^status: erledigt$/m.test(t), "status erledigt"],
    [d.includes("## Zeiterfassung\n- 09:15–10:20 [[DEV-1564 Zentrale Pipeline anlegen]] · ⏱ 1h 05m"), "Tagesnotiz Block 1"],
    [d.startsWith("---\ntyp: daily\ndatum: 2026-11-18"), "Tagesnotiz aus Vorlage"],
    [(d.match(/⏱/g) ?? []).length === 2, "kurzer Block nicht protokolliert"],
    [p.data.pendingLogs.length === 0, "nichts mehr ausstehend"],
  ];
  for (const [ok, m] of checks) if (!ok) console.log("FAIL", m);
  // onunload with running timer → pending persisted
  p.data.queue=[path]; p.data.timers[path] = {elapsed:0, startedAt: Date.now()-5*60000}; p.onunload(); console.log("pending after unload:", p._saved.pendingLogs.length); if (p._saved.pendingLogs.length !== 1) console.log("FAIL unload");
})();
