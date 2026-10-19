process.env.BRAND_SIN_PROYECTO = "1";
const test = require("node:test");
const assert = require("node:assert/strict");
const ig = require("../instagram");
const fb = require("../facebook");
const publisher = require("../publisher-rules");

const respuesta = (status, body) => ({ ok: status < 400, status, json: async () => body });
async function conFetch(fake, fn) {
  const orig = global.fetch;
  global.fetch = fake;
  try { return await fn(); } finally { global.fetch = orig; }
}
const cuerpo = (opts) => new URLSearchParams(opts.body);

test("Instagram: cada imagen es un item de carrusel y el carrusel junta los ids en orden", async () => {
  const pedidos = [];
  await conFetch(async (url, opts) => { pedidos.push({ url: String(url), body: cuerpo(opts) }); return respuesta(200, { id: `c${pedidos.length}` }); }, async () => {
    assert.equal(await ig.crearItemCarrusel("IG", "T", "https://x/1.jpg"), "c1");
    assert.equal(await ig.crearContenedorCarrusel("IG", "T", ["a", "b", "c"], "Texto #tag"), "c2");
  });
  assert.equal(pedidos[0].body.get("is_carousel_item"), "true");
  assert.equal(pedidos[0].body.get("image_url"), "https://x/1.jpg");
  assert.equal(pedidos[0].body.get("media_type"), null);
  assert.equal(pedidos[1].body.get("media_type"), "CAROUSEL");
  assert.equal(pedidos[1].body.get("children"), "a,b,c");
  assert.equal(pedidos[1].body.get("caption"), "Texto #tag");
  assert.match(pedidos[1].url, /\/IG\/media$/);
});

test("Facebook: sube cada foto sin publicar y arma un solo post con todas, en orden", async () => {
  const pedidos = [];
  let n = 0;
  const r = await conFetch(async (url, opts) => {
    pedidos.push({ url: String(url), body: cuerpo(opts) });
    return respuesta(200, String(url).endsWith("/feed") ? { id: "PAG_77" } : { id: `f${++n}` });
  }, () => fb.publicarAlbum("PAG", "T", { urls: ["https://x/1.jpg", "https://x/2.jpg"], mensaje: "Hola" }));
  assert.equal(r.url, "https://www.facebook.com/PAG_77");
  assert.equal(pedidos.length, 3);
  assert.equal(pedidos[0].body.get("published"), "false");
  assert.equal(pedidos[1].body.get("url"), "https://x/2.jpg");
  const feed = pedidos[2];
  assert.match(feed.url, /\/PAG\/feed$/);
  assert.equal(feed.body.get("message"), "Hola");
  assert.deepEqual(JSON.parse(feed.body.get("attached_media[0]")), { media_fbid: "f1" });
  assert.deepEqual(JSON.parse(feed.body.get("attached_media[1]")), { media_fbid: "f2" });
});

test("Facebook: si falla una foto, no publica el post", async () => {
  const urls = [];
  await assert.rejects(conFetch(async (url) => { urls.push(String(url)); return respuesta(400, { error: { message: "boom", code: 1 } }); },
    () => fb.publicarAlbum("PAG", "T", { urls: ["https://x/1.jpg"], mensaje: "Hola" })));
  assert.equal(urls.some((u) => u.endsWith("/feed")), false);
});

test("carrusel válido: de 2 a 10 imágenes", () => {
  const items = (n) => ({ tipo: "carrusel", items: Array.from({ length: n }, (_, i) => ({ url: `u${i}`, path: `p${i}` })) });
  assert.equal(publisher.motivoCarruselInvalido(items(2)), "");
  assert.equal(publisher.motivoCarruselInvalido(items(10)), "");
  assert.match(publisher.motivoCarruselInvalido(items(1)), /2 a 10/);
  assert.match(publisher.motivoCarruselInvalido(items(11)), /2 a 10/);
  assert.match(publisher.motivoCarruselInvalido({ tipo: "carrusel" }), /tiene 0/);
});

test("itemsDeImagen: carrusel, foto o placa; el video no tiene imágenes", () => {
  assert.equal(publisher.itemsDeImagen({ tipo: "carrusel", items: [{ url: "a" }, { url: "b" }] }).length, 2);
  assert.equal(publisher.itemsDeImagen({ tipo: "foto", url: "a" }).length, 1);
  assert.equal(publisher.itemsDeImagen({ tipo: "placa", url: "a" }).length, 1);
  assert.deepEqual(publisher.itemsDeImagen({ tipo: "video", url: "a" }), []);
});
