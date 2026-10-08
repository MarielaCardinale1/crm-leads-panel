const test = require("node:test");
const assert = require("node:assert/strict");
const { weeklyPlan, nextMonday, buildPostPrompt, parsePost } = require("../posts-rules");
const { renderPlaca } = require("../placa");

test("Plan semanal: 3 posts (agenda, ficha, web) lun/mié/vie 10:00 de la semana siguiente", () => {
  const plan = weeklyPlan("2026-10-07"); // miércoles
  assert.deepEqual(plan.map((p) => p.oferta), ["agenda online", "ficha de google", "sitio web"]);
  assert.deepEqual(plan.map((p) => p.fechaPublicacion), ["2026-10-12 10:00", "2026-10-14 10:00", "2026-10-16 10:00"]);
});

test("Si hoy es lunes, planifica el lunes siguiente (no hoy)", () => {
  assert.equal(nextMonday("2026-10-12"), "2026-10-19");
  assert.equal(nextMonday("2026-10-11"), "2026-10-12"); // domingo
});

test("Los ángulos rotan entre semanas", () => {
  const a = weeklyPlan("2026-10-07").map((p) => p.angulo);
  const b = weeklyPlan("2026-10-14").map((p) => p.angulo);
  assert.notDeepEqual(a, b);
});

test("El prompt lleva solo hechos reales y prohíbe inventar", () => {
  const [agenda] = weeklyPlan("2026-10-07");
  const { system, user } = buildPostPrompt(agenda);
  assert.ok(JSON.parse(user).hechosDeLaOferta.some((h) => h.includes("19 €/mes")));
  assert.match(system, /No inventes precios/);
});

test("Salida válida: se acepta y se acota", () => {
  const r = parsePost(JSON.stringify({ placa: { titulo: "x".repeat(200), subtitulo: "s" }, instagram: "ig", linkedin: "li" }));
  assert.equal(r.ok, true);
  assert.equal(r.placa.titulo.length, 70);
});

test("Salida inválida o incompleta: lo dice", () => {
  assert.equal(parsePost("hola").ok, false);
  assert.equal(parsePost(JSON.stringify({ placa: { titulo: "t" }, instagram: "ig" })).ok, false);
});

test("La placa se genera como PNG", async () => {
  const png = await renderPlaca({ etiqueta: "Sitio web", titulo: "Tu web, clara y rápida", subtitulo: "" });
  assert.equal(png.subarray(1, 4).toString(), "PNG");
});

test("Pinterest: el post trae título y descripción sin hashtags, acotados", () => {
  const r = parsePost(JSON.stringify({ placa: { titulo: "t" }, instagram: "ig", linkedin: "li", pinterest: { titulo: "x".repeat(150), descripcion: "Agenda online #salon para tu centro" } }));
  assert.equal(r.pinterest.titulo.length, 100);
  assert.equal(r.pinterest.descripcion.includes("#"), false);
  const sinPin = parsePost(JSON.stringify({ placa: { titulo: "t" }, instagram: "ig", linkedin: "li" }));
  assert.equal(sinPin.ok, true);
  assert.equal(sinPin.pinterest, null);
});

test("La placa de Pinterest sale vertical 1000x1500", async () => {
  const png = await renderPlaca({ etiqueta: "Agenda online", titulo: "Reservas sin llamadas", subtitulo: "" }, "pin");
  assert.equal(png.readUInt32BE(16), 1000);
  assert.equal(png.readUInt32BE(20), 1500);
});
