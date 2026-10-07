const test = require("node:test");
const assert = require("node:assert/strict");
const { checkLead, buildPrompt, parseModelOutput, whatsappLink } = require("../copy-rules");

const base = { nombre: "Laura", negocio: "Estudio Luz", oferta: "Ecommerce para creadores", estado: "nuevo" };

test("Lead completo: se puede redactar", () => {
  assert.equal(checkLead(base, "email").ok, true);
});

test("Datos incompletos: no redacta y dice qué falta", () => {
  const r = checkLead({ estado: "nuevo" }, "whatsapp");
  assert.equal(r.ok, false);
  assert.deepEqual(r.faltantes, ["nombre o negocio", "oferta de interés"]);
});

test("Espera mi respuesta sin saber qué responder: no inventa", () => {
  const r = checkLead({ ...base, estado: "esperando_mi_respuesta" }, "email");
  assert.equal(r.ok, false);
  assert.match(r.motivo, /qué hay que responder/);
});

test("Ganado o perdido: no hace falta mensaje", () => {
  assert.equal(checkLead({ ...base, estado: "ganado" }, "email").ok, false);
});

test("Canal inválido", () => {
  assert.equal(checkLead(base, "instagram").ok, false);
});

test("El prompt lleva solo hechos reales de la oferta", () => {
  const { system, user } = buildPrompt(base, "email");
  const data = JSON.parse(user);
  assert.ok(data.hechosDeLaOferta.some((h) => h.includes("canje")));
  assert.match(system, /No inventes precios/);
  const agenda = JSON.parse(buildPrompt({ ...base, oferta: "Agenda Online" }, "whatsapp").user);
  assert.ok(agenda.hechosDeLaOferta.some((h) => h.includes("19 €/mes")));
});

test("Oferta sin hechos cargados: le prohíbe describir características", () => {
  const { system, user } = buildPrompt({ ...base, oferta: "Web a medida" }, "email");
  assert.deepEqual(JSON.parse(user).hechosDeLaOferta, []);
  assert.match(system, /no describas características ni precios/);
});

test("Salida del modelo: JSON válido, con o sin ```", () => {
  const r = parseModelOutput('```json\n{"asunto":"Hola Laura","mensaje":"Texto"}\n```', "email");
  assert.deepEqual([r.ok, r.asunto, r.mensaje], [true, "Hola Laura", "Texto"]);
});

test("Salida del modelo inválida o vacía: lo dice, no inventa", () => {
  assert.equal(parseModelOutput("no es json", "email").ok, false);
  assert.equal(parseModelOutput('{"mensaje":""}', "whatsapp").ok, false);
  assert.equal(parseModelOutput('{"mensaje":"hola"}', "email").ok, false, "email sin asunto");
});

test("WhatsApp: asunto siempre vacío y largo acotado", () => {
  const r = parseModelOutput(JSON.stringify({ asunto: "x", mensaje: "a".repeat(900) }), "whatsapp");
  assert.equal(r.asunto, "");
  assert.equal(r.mensaje.length, 600);
  assert.equal(r.recortado, true);
});

test("Link de WhatsApp solo si el contacto es un teléfono", () => {
  assert.match(whatsappLink("612 345 678", "Hola"), /^https:\/\/wa\.me\/34612345678\?text=Hola$/);
  assert.match(whatsappLink("+54 9 11 2345 6789", "Hola"), /wa\.me\/5491123456789/);
  assert.equal(whatsappLink("laura@mail.com", "Hola"), "");
  assert.equal(whatsappLink("@laura.ig", "Hola"), "");
});
