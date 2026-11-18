import { statusTone } from "../src/main";
const c: [string,string][] = [["Offen","gray"],["In Development","blue"],["In Testing","purple"],["Ready for testing","purple"],["Test Failed","red"],["Wartet auf Kunden","orange"],["Fertig","green"],["Deployment Test","purple"],["Claude Review","purple"],["Blocked","red"],["in Arbeit","blue"],["offen","gray"]];
let f=0; for (const [s,t] of c) if (statusTone(s)!==t) {f++;console.log("FAIL",s,statusTone(s));}
console.log(f?"FEHLER":"OK");
