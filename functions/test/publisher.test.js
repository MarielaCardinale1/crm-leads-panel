const test = require("node:test");
const assert = require("node:assert/strict");
const p = require("../publisher-rules");

const base = { estado: "aprobado", fechaPublicacion: "2026-10-12 10:00", redes: ["instagram", "linkedin"] };

test("Hora de Madrid en formato del post", () => {
  assert.equal(p.nowKey(new Date("2026-10-12T08:05:00Z")), "2026-10-12 10:05"); // verano: UTC+2
  assert.equal(p.nowKey(new Date("2026-12-01T09:00:00Z")), "2026-12-01 10:00"); // invierno: UTC+1
});

test("Solo publica aprobados con fecha cumplida", () => {
  assert.equal(p.isDue(base, "2026-10-12 09:59"), false);
  assert.equal(p.isDue(base, "2026-10-12 10:00"), true);
  assert.equal(p.isDue({ ...base, estado: "borrador" }, "2026-10-13 10:00"), false);
  assert.equal(p.isDue({ ...base, estado: "descartado" }, "2026-10-13 10:00"), false);
});

test("No republica lo ya publicado y corta tras 3 fallos", () => {
  assert.equal(p.isDue({ ...base, publicacion: { instagram: { ok: true } } }, "2026-10-13 10:00"), false);
  assert.equal(p.isDue({ ...base, publicacion: { instagram: { ok: false, intentos: 3 } } }, "2026-10-13 10:00"), false);
  assert.equal(p.isDue({ ...base, publicacion: { instagram: { ok: false, intentos: 1 } } }, "2026-10-13 10:00"), true);
});

test("LinkedIn todavía no se publica (sin app)", () => {
  assert.deepEqual(p.pendingRedes({ ...base, redes: ["linkedin"] }), []);
});

test("Pasa a publicado solo cuando salieron todas sus redes", () => {
  assert.equal(p.estadoTras({ ...base, publicacion: { instagram: { ok: true } } }), "aprobado");
  assert.equal(p.estadoTras({ ...base, redes: ["instagram"], publicacion: { instagram: { ok: true } } }), "publicado");
});

test("Caption de Instagram: máximo 30 hashtags y 2200 caracteres", () => {
  const tags = Array.from({ length: 35 }, (_, i) => `#t${i}`).join(" ");
  assert.equal((p.captionInstagram(`hola ${tags}`).match(/#/g) || []).length, 30);
  assert.equal(p.captionInstagram("x".repeat(3000)).length, 2200);
});

test("Fotos fuera de formato llevan bordes", () => {
  assert.equal(p.necesitaBordes(1080, 1350), false);
  assert.equal(p.necesitaBordes(1080, 1920), true); // foto vertical del celular
  assert.equal(p.necesitaBordes(1080, 1080), false);
});
