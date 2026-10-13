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

const CAMPOS = "name,id,access_token,instagram_business_account{id,username}";

/** Paginas de las empresas (portfolios) a las que el usuario tiene acceso: las que no salen en /me/accounts. */
async function paginasDeEmpresas(token) {
  const out = [];
  try {
    const biz = await get(`${G}/me/businesses?fields=id,name&limit=100&access_token=${encodeURIComponent(token)}`);
    for (const b of biz.data || []) {
      for (const edge of ["owned_pages", "client_pages"]) {
        try {
          const r = await get(`${G}/${b.id}/${edge}?fields=${CAMPOS}&limit=100&access_token=${encodeURIComponent(token)}`);
          for (const p of r.data || []) out.push({ ...p, empresa: b.name });
        } catch { /* sin permiso sobre esta empresa: se sigue con las demas */ }
      }
    }
  } catch { /* el token no tiene business_management */ }
  return out;
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
  const pages = await get(`${G}/me/accounts?fields=${CAMPOS}&limit=100&access_token=${encodeURIComponent(long.access_token)}`);
  const todas = [...(pages.data || [])];
  for (const p of await paginasDeEmpresas(long.access_token)) {
    const ya = todas.find((x) => x.id === p.id);
    if (!ya) todas.push(p);
    else if (!ya.empresa) ya.empresa = p.empresa;
  }
  console.log("\nPaginas que ve este token:");
  if (!todas.length) console.log("  (ninguna)");
  todas.forEach((p, i) => console.log(`  ${i + 1}) ${p.name} | ID de pagina: ${p.id} | Instagram: ${p.instagram_business_account ? "@" + p.instagram_business_account.username : "NO vinculado"}${p.empresa ? ` | Empresa: ${p.empresa}` : ""}${p.access_token ? "" : " | SIN ACCESO para publicar"}`));
  const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
  const directo = (await rl2.question("\n4) Si tu pagina NO esta en la lista, pega aca su ID de Facebook. Si esta, apreta Enter: ")).trim();
  let page;
  if (directo) {
    page = await get(`${G}/${encodeURIComponent(directo)}?fields=name,id,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(long.access_token)}`);
    if (!page.access_token) throw new Error("Este token no tiene acceso de administrador a esa pagina. Revisa que la cuenta de Facebook que genero el token administre la pagina.");
  } else {
    const n = Number((await rl2.question(`5) Elegi el numero de la pagina (1-${todas.length}): `)).trim());
    page = todas[n - 1];
    if (page && !page.access_token) throw new Error(`El token no tiene acceso de publicacion a "${page.name}". En Meta Business Suite > Configuracion > Usuarios > Personas, asignate esa pagina con control total, y genera el token de nuevo.`);
  }
  if (!page) throw new Error("Numero invalido. No se guardo nada.");
  if (!page.instagram_business_account) throw new Error(`La pagina "${page.name}" no tiene un Instagram profesional vinculado. Vincularlo en Facebook y repetir. No se guardo nada.`);
  // Antes de guardar: revisar que la clave de la página tenga los permisos que usa el Publicador.
  const NECESARIOS = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "instagram_basic", "instagram_content_publish"];
  try {
    const dbg = await get(`${G}/debug_token?input_token=${encodeURIComponent(page.access_token)}&access_token=${encodeURIComponent(`${appId}|${secret}`)}`);
    const tiene = new Set(dbg.data?.scopes || []);
    console.log(`\nPermisos de la clave de "${page.name}": ${[...tiene].join(", ") || "(ninguno)"}`);
    const faltan = NECESARIOS.filter((x) => !tiene.has(x));
    if (faltan.length) {
      throw new Error(`A esta clave le faltan permisos: ${faltan.join(", ")}.\n  Volve al Explorador de Meta, agrega esos permisos en "Agregar un permiso" (abajo tiene que decir ${NECESARIOS.length + 1} opciones o mas), apreta Generate Access Token, acepta lo que Meta pregunte y corre este archivo de nuevo.\n  No se guardo nada.`);
    }
    console.log("OK: la clave tiene todos los permisos necesarios.");
  } catch (e) {
    if (/faltan permisos/.test(e.message)) throw e;
    console.log(`(No pude verificar los permisos: ${e.message}. Se sigue igual.)`);
  }
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
