const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../../tools/contenido-rules.cjs");

const H = "a".repeat(64);
const PIEZA = `---
canal: contenido-reel
panel: viajahoytips
slug: contenido-yosemite-error-20261026
url: https://viajahoytips.com/yosemite
fechaPublicacion: 2026-10-26 10:00
etiqueta: Yosemite
placa_titulo: El error más común al ir a Yosemite
placa_subtitulo: Y cómo evitarlo
pin_titulo:
pin_descripcion:
medios:
  - {archivo: video.mp4, tipo: video, bytes: 100, sha256: "${H}"}
  - {archivo: portada.jpg, tipo: imagen, bytes: 50, sha256: "${H}"}
aprobado_en: grok-bot
llegada:
publicar_despues_de:
estado: entrante
---
## Instagram
El error que más se repite en Yosemite.
#Yosemite #ViajaHoyTips
## Facebook
El error más común al planificar Yosemite:
https://viajahoytips.com/yosemite
## YouTube
Título: El error más común al ir a Yosemite (y cómo evitarlo)
Descripción: Guía completa en https://viajahoytips.com/yosemite
`;
const ok = { "video.mp4": { bytes: 100, sha256: H }, "portada.jpg": { bytes: 50, sha256: H } };

test("lee frontmatter, medios y secciones sin tocar los textos", () => {
  const { meta, secciones } = R.parsePieza(PIEZA);
  assert.equal(meta.slug, "contenido-yosemite-error-20261026");
  assert.equal(meta.fechaPublicacion, "2026-10-26 10:00");
  assert.equal(meta.pin_titulo, "");
  assert.deepEqual(meta.medios[0], { archivo: "video.mp4", tipo: "video", bytes: 100, sha256: H });
  assert.equal(secciones.instagram, "El error que más se repite en Yosemite.\n#Yosemite #ViajaHoyTips");
  assert.equal(secciones.facebook.endsWith("https://viajahoytips.com/yosemite"), true);
});

test("arma el JSON de postsImport y separa el texto de YouTube", () => {
  const { meta, secciones } = R.parsePieza(PIEZA);
  const j = R.armarJson(meta, secciones);
  assert.equal(j.pinterest, undefined);
  assert.equal(j.placa.titulo, "El error más común al ir a Yosemite");
  assert.equal(j.youtube.titulo, "El error más común al ir a Yosemite (y cómo evitarlo)");
  assert.match(j.youtube.descripcion, /^Guía completa/);
  const posts = require("../posts-rules");
  assert.equal(posts.validarImportado(j).ok, true);
});

test("los medios se verifican contra los archivos reales", () => {
  const { meta } = R.parsePieza(PIEZA);
  assert.deepEqual(R.revisarMedios(meta, ok), []);
  assert.match(R.revisarMedios(meta, { ...ok, "video.mp4": { bytes: 99, sha256: H } }).join(" "), /pesa 99/);
  assert.match(R.revisarMedios(meta, { ...ok, "video.mp4": { bytes: 100, sha256: "b".repeat(64) } }).join(" "), /no coincide/);
  assert.match(R.revisarMedios(meta, { "video.mp4": ok["video.mp4"] }).join(" "), /Falta el archivo portada.jpg/);
  const falso = { ...meta, medios: [{ ...meta.medios[0], sha256: "…" }, meta.medios[1]] };
  assert.match(R.revisarMedios(falso, ok).join(" "), /sha256 vacío o inválido/);
});

test("reel: un solo video; carrusel: 2 a 10 imágenes", () => {
  const { meta } = R.parsePieza(PIEZA);
  assert.match(R.revisarMedios({ ...meta, medios: [meta.medios[1]] }, ok).join(" "), /exactamente un video/);
  const img = (n) => ({ archivo: `c${n}.jpg`, tipo: "imagen", bytes: 50, sha256: H });
  const arch = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`c${i}.jpg`, { bytes: 50, sha256: H }]));
  const car = (n) => ({ ...meta, canal: "contenido-carrusel", medios: Array.from({ length: n }, (_, i) => img(i)) });
  assert.deepEqual(R.revisarMedios(car(5), arch(5)), []);
  assert.match(R.revisarMedios(car(1), arch(1)).join(" "), /2 a 10/);
  assert.match(R.revisarMedios(car(11), arch(11)).join(" "), /2 a 10/);
});

test("veto de 12 h: fija la llegada, espera y libera", () => {
  const { meta } = R.parsePieza(PIEZA);
  const t0 = new Date(2026, 9, 19, 9, 0).getTime();
  const nueva = R.estadoVeto(meta, t0);
  assert.equal(nueva.estado, "recien-llegada");
  assert.equal(nueva.llegada, "2026-10-19 09:00");
  assert.equal(nueva.despues, "2026-10-19 21:00");
  const m = { ...meta, llegada: nueva.llegada, publicar_despues_de: nueva.despues };
  assert.equal(R.estadoVeto(m, t0 + 11 * 3600e3).estado, "en-veto");
  assert.equal(R.estadoVeto(m, t0 + 12 * 3600e3).estado, "lista");
  assert.equal(R.estadoVeto({ ...m, estado: "vetada" }, t0 + 99 * 3600e3).estado, "vetada");
});

test("actualizar el frontmatter no toca los textos", () => {
  const nuevo = R.actualizarFrontmatter(PIEZA, { llegada: "2026-10-19 09:00", estado: "en_veto" });
  assert.match(nuevo, /^llegada: 2026-10-19 09:00$/m);
  assert.match(nuevo, /^estado: en_veto$/m);
  assert.equal(nuevo.split("\n---\n")[1], PIEZA.split("\n---\n")[1]);
});
