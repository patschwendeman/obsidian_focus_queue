import { parseSubtasks, tickSubtask, splitItem, itemId } from "../src/main";
let fail = 0;
const ok = (c: boolean, m: string) => {
	if (!c) {
		fail++;
		console.log("FAIL", m);
	}
};

const note = [
	"# T",
	"## Unteraufgaben",
	"- [ ] Jira-Sub (DEV-1)",
	"",
	"## Subtasks",
	"- [ ] Vorlage sichten",
	"- [x] Pipeline bauen",
	"  - [ ] eingerückt",
	"- kein Task",
	"",
	"## Analyse / Lösung",
	"- [ ] nicht hier",
].join("\n");

const subs = parseSubtasks(note);
ok(subs.length === 3, "drei Subtasks: " + JSON.stringify(subs));
ok(subs[0].text === "Vorlage sichten" && !subs[0].done, "offen");
ok(subs[1].done, "erledigt erkannt");
ok(!subs.some((s) => s.text.includes("Jira-Sub") || s.text.includes("nicht hier")), "nur eigener Abschnitt");
ok(parseSubtasks("# ohne\n- [ ] x").length === 0, "kein Abschnitt → leer");
ok(parseSubtasks(note, "## Unteraufgaben").length === 1, "anderer Abschnitt per Einstellung");

const ticked = tickSubtask(note, "Vorlage sichten");
ok(ticked.includes("- [x] Vorlage sichten"), "abgehakt");
ok(ticked.includes("- [ ] Jira-Sub (DEV-1)") && ticked.includes("- [ ] nicht hier"), "Rest unverändert");
ok(tickSubtask(note, "gibt es nicht") === note, "unbekannter Text ändert nichts");

const id = itemId("23 Tickets/A.md", "Vorlage sichten");
ok(id === "23 Tickets/A.md::Vorlage sichten", "id");
const it = splitItem(id);
ok(it.path === "23 Tickets/A.md" && it.sub === "Vorlage sichten", "split");
ok(splitItem("23 Tickets/A.md").sub === null, "ganzes Ticket");
ok(splitItem(itemId("p.md", "a :: b")).sub === "a :: b", "Text mit Trenner bleibt heil");

console.log(fail ? fail + " FEHLER" : "Alle Checks OK");
