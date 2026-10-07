/**
 * Convierte la clave corta del Explorer en la clave de la página (no vence)
 * y la guarda como secreto IG_PAGE_TOKEN en Firebase. Nunca la muestra.
 */
const { execFileSync } = require("node:child_process");
const readline = require("node:readline/promises");

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
  const page = (pages.data || []).find((p) => p.instagram_business_account) || null;
  if (!page) throw new Error("No encontre ninguna pagina con Instagram conectado. Revisa los permisos en el Explorer.");
  console.log(`Pagina: ${page.name} | Instagram: @${page.instagram_business_account.username} | ID: ${page.instagram_business_account.id}`);
  console.log("Guardando la clave en Firebase (secreto IG_PAGE_TOKEN)...");
  execFileSync("npx --yes firebase-tools functions:secrets:set IG_PAGE_TOKEN --data-file -", { input: page.access_token, stdio: ["pipe", "inherit", "inherit"], shell: true });
  console.log(`\nListo. Pasale a Claude solo este numero: ${page.instagram_business_account.id}`);
})().catch((e) => {
  console.error(`\nERROR: ${e.message}`);
  process.exitCode = 1;
});
