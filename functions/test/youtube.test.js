process.env.BRAND_SIN_PROYECTO = "1";
const test = require("node:test");
const assert = require("node:assert/strict");
const yt = require("../youtube");
const p = require("../publisher-rules");

test("El refresh token se guarda cifrado y se recupera", () => {
  const blob = yt.cifrar("1//token-secreto", "clave");
  assert.ok(!blob.includes("token-secreto"));
  assert.equal(yt.descifrar(blob, "clave"), "1//token-secreto");
  assert.throws(() => yt.descifrar(blob, "otra-clave"));
});

test("El video siempre se sube PRIVADO y no es para niños", () => {
  const m = yt.metadatos({ titulo: "t", descripcion: "d" });
  assert.equal(m.status.privacyStatus, "private");
  assert.equal(m.status.selfDeclaredMadeForKids, false);
  assert.equal(m.snippet.title, "t");
});

test("La conexión pide offline + consent (si no, Google no da refresh token) y solo el permiso de subir", () => {
  const u = new URL(yt.authUrl("id", "https://x/cb", "st"));
  assert.equal(u.searchParams.get("access_type"), "offline");
  assert.equal(u.searchParams.get("prompt"), "consent");
  assert.equal(u.searchParams.get("scope"), "https://www.googleapis.com/auth/youtube.upload");
  assert.equal(u.searchParams.get("state"), "st");
});

test("Texto de YouTube: título con #Shorts (máx. 100) y descripción sin hashtags de Instagram, con el link", () => {
  const post = { placa: { titulo: "x".repeat(200) }, instagram: "Hola #viaje\n\n\n\nChau #zion", url: "https://viajahoytips.com/zion" };
  const t = p.textoYoutube(post);
  assert.ok(t.titulo.length <= 100 && t.titulo.endsWith("#Shorts"));
  assert.ok(!t.descripcion.includes("#viaje") && !t.descripcion.includes("#zion"));
  assert.ok(t.descripcion.includes("https://viajahoytips.com/zion") && t.descripcion.endsWith("#Shorts"));
});
