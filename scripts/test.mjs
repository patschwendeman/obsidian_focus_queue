// Bündelt jede test/*.test.ts mit esbuild (Obsidian-API gemockt) und führt sie aus.
import { build } from "esbuild";
import { readdirSync, mkdirSync } from "fs";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "test", ".out");
mkdirSync(out, { recursive: true });
let failed = 0;
for (const f of readdirSync(join(root, "test")).filter((x) => x.endsWith(".test.ts"))) {
	const mock = f.startsWith("timelog") ? "obsidian-mock.js" : "obsidian-stub.js";
	const file = join(out, f.replace(/\.ts$/, ".cjs"));
	await build({
		entryPoints: [join(root, "test", f)],
		bundle: true,
		platform: "node",
		format: "cjs",
		outfile: file,
		alias: { obsidian: join(root, "test", mock) },
		logLevel: "error",
	});
	process.stdout.write(`▶ ${f}\n`);
	const res = execFileSync("node", [file], { encoding: "utf8", timeout: 20000 });
	process.stdout.write(res);
	if (/FAIL|FEHLER/.test(res)) failed++;
}
if (failed) {
	console.error(`\n${failed} Testdatei(en) mit Fehlern`);
	process.exit(1);
}
console.log("\nAlle Tests grün.");
