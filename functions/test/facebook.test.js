process.env.BRAND_SIN_PROYECTO = "1";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const fb = require("../facebook");
const publisher = require("../publisher-rules");

const respuesta = (status, body) => ({ ok: status < 400, status, json: async () => body });
function conFetch(fake, fn) {
  const orig = global.fetch;
  global.fetch = fake;
  return Promise.resolve(fn()).finally(() => { global.fetch = orig; });
}

test("Foto: publica en la Página con el texto y devuelve el link", async () => {
  let pedido;
  await conFetch(async (url, opts) => { pedido = { url: String(url), body: new URLSearchParams(opts.body) }; return respuesta(200, { id: "1", post_id: "467204289813367_99" }); }, async () => {
    const r = await fb.publicarFoto("467204289813367", "TOKEN", { url: "https://x/img.png", mensaje: "Hola" });
    assert.equal(r.url, "https://www.facebook.com/467204289813367_99");
  });
  assert.match(pedido.url, /\/467204289813367\/photos$/);
  assert.equal(pedido.body.get("message"), "Hola");
  assert.equal(pedido.body.get("url"), "https://x/img.png");
  assert.equal(pedido.body.get("access_token"), "TOKEN");
});

test("Video: usa file_url y description", async () => {
  let body;
  await conFetch(async (url, opts) => { assert.match(String(url), /\/videos$/); body = new URLSearchParams(opts.body); return respuesta(200, { id: "55" }); }, async () => {
    const r = await fb.publicarVideo("1", "T", { url: "https://x/v.mp4", mensaje: "Mira" });
    assert.equal(r.url, "https://www.facebook.com/55");
  });
  assert.equal(body.get("file_url"), "https://x/v.mp4");
  assert.equal(body.get("description"), "Mira");
});

test("Error de permiso: explica qué hacer, en castellano", async () => {
  await conFetch(async () => respuesta(403, { error: { code: 200, message: "(#200) Requires pages_manage_posts permission" } }), async () => {
    await assert.rejects(fb.publicarFoto("1", "T", { url: "u", mensaje: "m" }), /pages_manage_posts.*Guardar token Instagram/s);
  });
});

test("Clave vencida: lo dice", async () => {
  await conFetch(async () => respuesta(400, { error: { code: 190, message: "Error validating access token" } }), async () => {
    await assert.rejects(fb.publicarFoto("1", "T", { url: "u", mensaje: "m" }), /venció/);
  });
});

test("Texto de Facebook: usa el propio, o el de Instagram sin hashtags y con el link", () => {
  assert.equal(publisher.textoFacebook({ facebook: "  Texto propio  " }), "Texto propio");
  const viejo = publisher.textoFacebook({ instagram: "Hola mundo\n\nMás info\n#zion #parques", url: "https://viajahoytips.com/zion" });
  assert.ok(!viejo.includes("#"));
  assert.ok(viejo.endsWith("https://viajahoytips.com/zion"));
  assert.ok(publisher.textoFacebook({ facebook: "x".repeat(5000) }).length <= 2000);
});

test("Facebook se publica solo si está activo; y se pasa a 'publicado' recién cuando salieron todas las redes", () => {
  const post = { estado: "aprobado", fechaPublicacion: "2026-10-12 10:00", redes: ["instagram", "facebook"], publicacion: { instagram: { ok: true } } };
  assert.deepEqual(publisher.pendingRedes(post, ["instagram"]), []);
  assert.deepEqual(publisher.pendingRedes(post, ["instagram", "facebook"]), ["facebook"]);
  assert.equal(publisher.estadoTras(post), "aprobado");
  assert.equal(publisher.estadoTras({ ...post, publicacion: { instagram: { ok: true }, facebook: { ok: true } } }), "publicado");
});

test("Redactor con el perfil de viajahoytips: pide texto de Facebook y no el de LinkedIn", () => {
  const perfil = path.join(__dirname, "..", "..", "proyectos", "viajahoytips", "project.json");
  const salida = execFileSync(process.execPath, ["-e", `
    const p = require("./posts-rules");
    const slot = p.weeklyPlan("2026-10-07")[0];
    const { system } = p.buildPostPrompt(slot);
    const ok = p.parsePost(JSON.stringify({ placa: { titulo: "t" }, instagram: "ig", facebook: "fbtexto" }));
    const sinFb = p.parsePost(JSON.stringify({ placa: { titulo: "t" }, instagram: "ig" }));
    console.log(JSON.stringify({ system, ok: ok.ok, facebook: ok.facebook, sinFb: sinFb.ok }));
  `], { cwd: path.join(__dirname, ".."), env: { ...process.env, BRAND_SIN_PROYECTO: "", BRAND_PROYECTO: perfil } }).toString();
  const r = JSON.parse(salida);
  assert.match(r.system, /Facebook: máximo 800 caracteres/);
  assert.match(r.system, /"facebook":string/);
  assert.ok(!/LinkedIn/.test(r.system));
  assert.equal(r.ok, true);
  assert.equal(r.facebook, "fbtexto");
  assert.equal(r.sinFb, false); // con Facebook activo, un post sin su texto no sirve
});
