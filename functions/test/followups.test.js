const test = require("node:test");
const assert = require("node:assert/strict");
const { decideFollowups, parseDueDate } = require("../followup-rules");

const HOY = "2026-09-30";
const tarea = (id, extra = {}) => ({ id, title: `Tarea ${id}`, status: "WAITING", updatedAt: "2026-09-20T10:00:00Z", ...extra });

test("Primera vez: todo es nuevo y se avisa", () => {
  const r = decideFollowups({ items: [tarea("a"), tarea("b"), { id: "c", status: "TODO" }] }, {}, HOY);
  assert.equal(r.total, 2);
  assert.equal(r.avisar.length, 2);
  assert.match(r.text, /Tenés 2 seguimientos pendientes/);
});

test("Nada cambió al día siguiente: NO se repite el aviso", () => {
  const first = decideFollowups({ items: [tarea("a")] }, {}, "2026-09-29");
  const second = decideFollowups({ items: [tarea("a")] }, first.memory, HOY);
  assert.equal(second.avisar.length, 0);
  assert.equal(second.silenciados, 1);
  assert.match(second.text, /Ninguno cambió/);
});

test("Mismo aviso pedido 20 veces el mismo día: sale una sola vez", () => {
  let mem = {};
  let avisos = 0;
  for (let i = 0; i < 20; i++) {
    const r = decideFollowups({ items: [tarea("a")] }, mem, HOY);
    avisos += r.avisar.length;
    mem = r.memory;
  }
  assert.equal(avisos, 1);
});

test("Si cambia (notas/estado/fecha), vuelve a avisar", () => {
  const first = decideFollowups({ items: [tarea("a")] }, {}, "2026-09-29");
  const r = decideFollowups({ items: [tarea("a", { notes: "respondió", updatedAt: "2026-09-30T09:00:00Z" })] }, first.memory, HOY);
  assert.equal(r.avisar[0].motivo, "cambió");
});

test("Vence hoy: avisa aunque se haya avisado antes", () => {
  const first = decideFollowups({ items: [tarea("a", { dueLabel: "2026-09-30" })] }, {}, "2026-09-29");
  const r = decideFollowups({ items: [tarea("a", { dueLabel: "2026-09-30" })] }, first.memory, HOY);
  assert.equal(r.avisar[0].motivo, "vence hoy");
});

test("Recordatorio cada 3 días si nada cambia", () => {
  const first = decideFollowups({ items: [tarea("a")] }, {}, "2026-09-27");
  const r = decideFollowups({ items: [tarea("a")] }, first.memory, HOY);
  assert.match(r.avisar[0].motivo, /sin novedades hace 3 días/);
});

test("Leads en espera cuentan; los que esperan MI respuesta van primero", () => {
  const r = decideFollowups({
    items: [tarea("a")],
    leads: [
      { id: "l1", nombre: "Bellahouse", estado: "esperando_su_respuesta", proximaAccion: "Recibir precios" },
      { id: "l2", nombre: "Laura", estado: "esperando_mi_respuesta", proximaAccion: "Mandar propuesta" },
      { id: "l3", nombre: "Cerrado", estado: "ganado" },
    ],
  }, {}, HOY);
  assert.equal(r.total, 3);
  assert.equal(r.avisar[0].titulo, "Laura — Mandar propuesta");
  assert.match(r.text, /espera TU respuesta/);
});

test("Sin seguimientos: lo dice", () => {
  assert.match(decideFollowups({ items: [] }, {}, HOY).text, /no tenés ninguno/);
});

test("Fechas: ISO y dd/mm; 'hoy' no se adivina", () => {
  assert.equal(parseDueDate("2026-10-02 10:00", HOY), "2026-10-02");
  assert.equal(parseDueDate("5/10", HOY), "2026-10-05");
  assert.equal(parseDueDate("hoy", HOY), null);
});
