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
  const pages = await get(`${G}/me/accounts?fields=name,id,access_token,instagram_business_account{id,username}&limit=100&access_token=${encodeURIComponent(long.access_token)}`);
  const todas = pages.data || [];
  console.log("\nPaginas que ve este token:");
  if (!todas.length) console.log("  (ninguna)");
  todas.forEach((p, i) => console.log(`  ${i + 1}) ${p.name} | ID de pagina: ${p.id} | Instagram: ${p.instagram_business_account ? "@" + p.instagram_business_account.username : "NO vinculado"}`));
  const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
  const directo = (await rl2.question("\n4) Si tu pagina NO esta en la lista, pega aca su ID de Facebook. Si esta, apreta Enter: ")).trim();
  let page;
  if (directo) {
    page = await get(`${G}/${encodeURIComponent(directo)}?fields=name,id,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(long.access_token)}`);
    if (!page.access_token) throw new Error("Este token no tiene acceso de administrador a esa pagina. Revisa que la cuenta de Facebook que genero el token administre la pagina.");
  } else {
    const n = Number((await rl2.question(`5) Elegi el numero de la pagina (1-${todas.length}): `)).trim());
    page = todas[n - 1];
  }
  if (!page) throw new Error("Numero invalido. No se guardo nada.");
  if (!page.instagram_business_account) throw new Error(`La pagina "${page.name}" no tiene un Instagram profesional vinculado. Vincularlo en Facebook y repetir. No se guardo nada.`);
  let proyecto = "(no encontrado: .firebaserc)";
  try { proyecto = JSON.parse(fs.readFileSync(".firebaserc", "utf8")).projects.default; } catch {}
  console.log(`\nSe va a guardar la clave de "${page.name}" en el proyecto de Firebase: ${proyecto}`);
  const ok = (await rl2.question("6) Es el correcto? (s/n): ")).trim().toLowerCase();
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
