const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const posts = require("../posts-rules");

const bueno = () => ({
  slug: "vuelos-accion-de-gracias-navidad-2026-cuando-comprar",
  etiqueta: "Vuelos de fiestas",
  url: "https://viajahoytips.com/vuelos-accion-de-gracias-navidad-2026-cuando-comprar",
  angulo: "Cuándo comprar el pasaje para Acción de Gracias",
  fechaPublicacion: "2026-10-23 10:00",
  placa: { titulo: "Cuándo comprar tu vuelo de fiestas", subtitulo: "Fechas y días más baratos" },
  instagram: "Si viajás para Acción de Gracias, comprá con tiempo. Mirá las fechas en el link.",
  facebook: "Cuándo conviene comprar el pasaje para Acción de Gracias y Navidad.",
  pinterest: { titulo: "Vuelos de Acción de Gracias 2026: cuándo comprar", descripcion: "Fechas, días más baratos para salir y volver." },
});

test("un post válido queda como borrador listo, con id estable y la semana calculada", () => {
  const r = posts.validarImportado(bueno());
  assert.equal(r.ok, true);
  assert.equal(r.id, "redes-vuelos-accion-de-gracias-navidad-2026-cuando-comprar");
  assert.equal(r.post.semana, "2026-S43");
  assert.equal(r.post.origen, "redes");
  assert.equal(r.post.oferta, "redes:vuelos-accion-de-gracias-navidad-2026-cuando-comprar");
  assert.equal(r.post.pinterest.titulo.length > 0, true);
  assert.equal(posts.validarImportado(bueno()).id, r.id, "importar dos veces da el mismo id");
});

test("rechaza lo que no se puede publicar", () => {
  const malos = [
    { ...bueno(), slug: "Con Espacios" },
    { ...bueno(), slug: "../x" },
    { ...bueno(), url: "http://viajahoytips.com/x" },
    { ...bueno(), url: "https://viajahoytips.com/ x" },
    { ...bueno(), fechaPublicacion: "2026-02-31 10:00" },
    { ...bueno(), fechaPublicacion: "mañana" },
    { ...bueno(), etiqueta: "" },
    { ...bueno(), placa: { titulo: "", subtitulo: "x" } },
    { ...bueno(), instagram: "   " },
    null,
  ];
  for (const m of malos) assert.equal(posts.validarImportado(m).ok, false, JSON.stringify(m)?.slice(0, 60));
});

test("recorta a los límites reales de cada red", () => {
  const b = bueno();
  b.instagram = "a".repeat(3000);
  b.facebook = "b".repeat(3000);
  b.placa.titulo = "t".repeat(200);
  b.placa.subtitulo = "s".repeat(300);
  b.pinterest = { titulo: "p".repeat(300), descripcion: "d".repeat(900) };
  const p = posts.validarImportado(b).post;
  assert.ok(p.instagram.length <= 2200 && p.facebook.length <= 2000);
  assert.ok(p.placa.titulo.length <= 70 && p.placa.subtitulo.length <= 100);
  assert.ok(p.pinterest.titulo.length <= 100 && p.pinterest.descripcion.length <= 500);
});

test("el pin sin texto queda en null (no rompe el post)", () => {
  const b = bueno();
  delete b.pinterest;
  assert.equal(posts.validarImportado(b).post.pinterest, null);
});

test("con el perfil de ViajaHoyTips, Facebook es obligatorio", () => {
  const perfil = path.join(__dirname, "..", "..", "proyectos", "viajahoytips", "project.json");
  const codigo = `
    const posts = require("./posts-rules");
    const b = ${JSON.stringify(bueno())};
    const con = posts.validarImportado(b).ok;
    const sin = posts.validarImportado({ ...b, facebook: "" }).ok;
    console.log(JSON.stringify({ con, sin }));`;
  const out = execFileSync(process.execPath, ["-e", codigo], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, BRAND_PROYECTO: perfil },
  }).toString();
  assert.deepEqual(JSON.parse(out), { con: true, sin: false });
});
