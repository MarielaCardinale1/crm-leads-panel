const test = require("node:test");
const assert = require("node:assert/strict");
const p = require("../prospector-rules");

test("6 búsquedas por semana, rotando tipo y zona", () => {
  const a = p.busquedasDeLaSemana(41);
  const b = p.busquedasDeLaSemana(42);
  assert.equal(a.length, 6);
  assert.notDeepEqual(a, b);
  assert.ok(new Set(a.map((x) => x.tipo)).size >= 4); // no 6 peluquerías juntas
});

test("Web con Booksy → P2", () => {
  const w = p.analizarWeb('<a href="https://booksy.com/es-es/123_salon">Reserva</a>');
  assert.equal(w.reservas, "Booksy");
  assert.equal(p.prioridad({ tieneWeb: true, reservas: w.reservas, ganchosFicha: [] }), "P2");
});

test("Web que pide llamar → P1, y saca el Instagram (no un post)", () => {
  const w = p.analizarWeb('<a href="tel:+34915945190">Llámanos</a> <a href="https://instagram.com/p/abc">post</a> <a href="https://www.instagram.com/cortoycambio/">IG</a>');
  assert.equal(w.reservas, "telefono");
  assert.equal(w.instagram, "@cortoycambio");
  assert.equal(p.prioridad({ tieneWeb: true, reservas: w.reservas, ganchosFicha: [] }), "P1");
});

test("Sin web → P1; con reservas propias y ficha completa → no se carga", () => {
  assert.equal(p.prioridad({ tieneWeb: false, reservas: null, ganchosFicha: [] }), "P1");
  assert.equal(p.prioridad({ tieneWeb: true, reservas: "propio", ganchosFicha: [] }), null);
  assert.equal(p.prioridad({ tieneWeb: true, reservas: "propio", ganchosFicha: ["ficha de Google sin horario"] }), "P3");
});

test("Ganchos de la ficha de Google", () => {
  assert.deepEqual(p.ganchosDeFicha({ userRatingCount: 4, rating: 5 }), ["ficha de Google sin horario", "solo 4 reseñas en Google"]);
  assert.deepEqual(p.ganchosDeFicha({ regularOpeningHours: {}, userRatingCount: 80, rating: 4.7 }), []);
});

test("Descarta cerrados, cadenas y repetidos", () => {
  const ctx = { vistos: new Set(["x1"]), nombresEnPanel: new Set([p.normalizar("Bellahouse")]), telefonosEnPanel: new Set(), conteoNombres: new Map([[p.normalizar("Salón Ana"), 2]]) };
  assert.equal(p.descartar({ id: "a", businessStatus: "CLOSED_PERMANENTLY", displayName: { text: "X" } }, ctx), "cerrado");
  assert.equal(p.descartar({ id: "b", displayName: { text: "Llongueras Getafe" } }, ctx), "cadena");
  assert.equal(p.descartar({ id: "c", displayName: { text: "Salón Ana" } }, ctx), "cadena (varias sucursales)");
  assert.equal(p.descartar({ id: "x1", displayName: { text: "Nuevo" } }, ctx), "ya visto");
  assert.equal(p.descartar({ id: "d", displayName: { text: "BellaHouse" } }, ctx), "ya está en el panel");
  assert.equal(p.descartar({ id: "e", businessStatus: "OPERATIONAL", displayName: { text: "Uñas Lola" } }, ctx), null);
});

test("Leads: P1 primero, máx. 20, 5 por día hábil con fecha", () => {
  const base = { motivo: "m", ganchos: [], direccion: "", tipo: "peluquería", zona: "Getafe", placeId: "id" };
  const cands = Array.from({ length: 25 }, (_, i) => ({ ...base, nombre: `N${i}`, prio: i % 2 ? "P2" : "P1", instagram: i % 3 ? `@n${i}` : "" }));
  const leads = p.armarLeads(cands, "2026-10-09"); // viernes
  assert.equal(leads.length, 20);
  assert.equal(leads[0].prioridadContacto, "P1");
  assert.equal(leads[0].fechaProximaAccion, "2026-10-09");
  assert.equal(leads[5].fechaProximaAccion, "2026-10-12"); // salta el finde
  assert.equal(leads[0].estado, "nuevo");
  assert.ok(leads.every((l) => l.notas.includes("Prospector")));
});
