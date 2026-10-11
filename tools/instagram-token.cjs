/**
 * Convierte la clave corta del Explorer en la clave de la página (no vence)
 * y la guarda como secreto IG_PAGE_TOKEN en Firebase. Nunca la muestra.
 */
const { execFileSync } = require("node:child_process");
const readline = require("node:readline/promises");
const fs = require("node:fs");

const G = "https://graph.facebook.com/v21.0";
const APP_ID_HINT = "Mariela Redes";

async function get(url) {
  const r = await fetch(url);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d;
}

(async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log(`Datos de la app "${APP_ID_HINT}" (Configuracion > Basica) y la clave del Explorer.\n`);
  const appId = (await rl.question("1) Identificador de la app: ")).trim();
  const secret = (await rl.question("2) Clave secreta de la app: ")).trim();
  const short = (await rl.question("3) Token del Explorer: ")).trim();
  rl.close();
  console.log("\nCanjeando por una clave larga...");
  const long = await get(`${G}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${secret}&fb_exchange_token=${encodeURIComponent(short)}`);
  const pages = await get(`${G}/me/accounts?fields=name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(long.access_token)}`);
  const conIg = (pages.data || []).filter((p) => p.instagram_business_account);
  if (!conIg.length) throw new Error("No encontre ninguna pagina con Instagram conectado. Revisa los permisos en el Explorer.");
  console.log("\nPaginas con Instagram conectado:");
  conIg.forEach((p, i) => console.log(`  ${i + 1}) ${p.name} | Instagram: @${p.instagram_business_account.username} | ID de pagina: ${p.id}`));
  const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
  const n = Number((await rl2.question(`\n4) Elegi el numero de la pagina (1-${conIg.length}): `)).trim());
  const page = conIg[n - 1];
  if (!page) throw new Error("Numero invalido. No se guardo nada.");
  let proyecto = "(no encontrado: .firebaserc)";
  try { proyecto = JSON.parse(fs.readFileSync(".firebaserc", "utf8")).projects.default; } catch {}
  console.log(`\nSe va a guardar la clave de "${page.name}" en el proyecto de Firebase: ${proyecto}`);
  const ok = (await rl2.question("5) Es el correcto? (s/n): ")).trim().toLowerCase();
  rl2.close();
  if (ok !== "s") throw new Error("Cancelado. No se guardo nada.");
  console.log(`Pagina: ${page.name} | Instagram: @${page.instagram_business_account.username} | ID: ${page.instagram_business_account.id}`);
  console.log("Guardando la clave en Firebase (secreto IG_PAGE_TOKEN)...");
  execFileSync("npx --yes firebase-tools functions:secrets:set IG_PAGE_TOKEN --data-file -", { input: page.access_token, stdio: ["pipe", "inherit", "inherit"], shell: true });
  console.log(`\nListo. Pasale a Claude estos dos numeros (no son secretos):\n  ID de Instagram: ${page.instagram_business_account.id}\n  ID de la pagina de Facebook: ${page.id}`);
})().catch((e) => {
  console.error(`\nERROR: ${e.message}`);
  process.exitCode = 1;
});
