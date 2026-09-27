const test = require("node:test");
const assert = require("node:assert/strict");
const { scoreLead, buildDailyOpportunities } = require("../lead-scoring-rules");

const HOY = "2026-09-27";

test("CASO A: pidió precio y espera respuesta → Alta", () => {
  const r = scoreLead({
    nombre: "Laura", negocio: "Estudio Luz", oferta: "Agenda Online",
    estado: "esperando_mi_respuesta", pidioPrecio: true,
    ultimaInteraccion: "2026-09-26", proximaAccion: "Mandar precio",
  }, HOY);
  assert.equal(r.prioridad, "Alta");
  assert.ok(r.motivos.includes("pidió precio"));
  assert.ok(r.motivos.includes("espera tu respuesta"));
  assert.ok(r.motivos.includes("interacción ayer"));
});

test("CASO B: buen encaje sin intención clara → Media", () => {
  const r = scoreLead({
    nombre: "Carla", negocio: "Peluquería Sol", oferta: "Agenda Online",
    estado: "conversando", ultimaInteraccion: "2026-09-25", proximaAccion: "Preguntar volumen de turnos",
  }, HOY);
  assert.equal(r.prioridad, "Media");
  assert.deepEqual(r.faltantes, []);
});

test("CASO C: lead antiguo sin actividad → Baja", () => {
  const r = scoreLead({
    nombre: "Marta", negocio: "Spa Norte", oferta: "Agenda Online",
    estado: "esperando_su_respuesta", ultimaInteraccion: "2026-06-01", proximaAccion: "Nada",
  }, HOY);
  assert.equal(r.prioridad, "Baja");
  assert.ok(r.motivos.some((m) => m.startsWith("sin actividad desde")));
});

test("CASO D: datos incompletos → no inventa y lista faltantes", () => {
  const r = scoreLead({ nombre: "Sin datos" }, HOY);
  assert.deepEqual(r.faltantes, ["estado comercial", "oferta de interés", "fecha de última interacción", "próxima acción"]);
  assert.ok(!r.motivos.some((m) => m.startsWith("interacción") || m.startsWith("sin actividad")));
  assert.equal(r.prioridad, "Baja");
});

test("CASO E: sin oportunidades relevantes → lo dice y no fuerza resultados", () => {
  const vacio = buildDailyOpportunities([], HOY);
  assert.equal(vacio.relevantes, 0);
  assert.match(vacio.text, /No hay leads abiertos/);

  const soloBajas = buildDailyOpportunities([
    { id: "1", nombre: "Viejo", oferta: "Agenda Online", estado: "conversando", ultimaInteraccion: "2026-01-01", proximaAccion: "x" },
    { id: "2", nombre: "Cerrado", estado: "ganado", pidioPrecio: true },
  ], HOY);
  assert.equal(soloBajas.relevantes, 0);
  assert.equal(soloBajas.opportunities.length, 1, "los ganados/perdidos no cuentan");
  assert.match(soloBajas.text, /No hay oportunidades relevantes hoy/);
});

test("Orden: Alta primero, después Media, después Baja", () => {
  const r = buildDailyOpportunities([
    { id: "c", nombre: "C", oferta: "Agenda Online", estado: "conversando", ultimaInteraccion: "2026-01-01", proximaAccion: "x" },
    { id: "a", nombre: "A", oferta: "Agenda Online", estado: "esperando_mi_respuesta", pidioPrecio: true, ultimaInteraccion: HOY, proximaAccion: "x" },
    { id: "b", nombre: "B", oferta: "Agenda Online", estado: "conversando", ultimaInteraccion: HOY, proximaAccion: "x" },
  ], HOY);
  assert.deepEqual(r.opportunities.map((o) => o.id), ["a", "b", "c"]);
  assert.match(r.text, /^Oportunidades de hoy/);
});

test("Plazo vencido suma y se explica", () => {
  const r = scoreLead({ nombre: "X", oferta: "Otra", estado: "conversando", fechaProximaAccion: "2026-09-25", proximaAccion: "Llamar", ultimaInteraccion: "2026-09-20" }, HOY);
  assert.ok(r.motivos.includes("próxima acción vencida (hace 2 días)"));
});

test("Oportunidades incluyen la próxima acción para el coordinador", () => {
  const r = buildDailyOpportunities([{ id: "x", nombre: "X", oferta: "Agenda Online", estado: "esperando_mi_respuesta", pidioPrecio: true, ultimaInteraccion: HOY, proximaAccion: "Mandar precio", fechaProximaAccion: "2026-09-28" }], HOY);
  assert.equal(r.opportunities[0].proximaAccion, "Mandar precio");
  assert.equal(r.opportunities[0].fechaProximaAccion, "2026-09-28");
});
