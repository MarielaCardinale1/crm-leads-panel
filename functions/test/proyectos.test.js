const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Perfiles listos en /proyectos: que estén completos y no se rompan sin que se note.
const dir = path.join(__dirname, "..", "..", "proyectos");
const perfiles = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => fs.existsSync(path.join(dir, n, "project.json"))) : [];

for (const nombre of perfiles) {
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, nombre, "project.json"), "utf8"));

  test(`Perfil ${nombre}: cada tema de redes tiene link y hechos`, () => {
    assert.ok(cfg.ofertasRedes.length >= 1);
    for (const o of cfg.ofertasRedes) {
      assert.match(o.url, /^https:\/\//, `${o.key}: falta el link`);
      assert.ok(o.etiqueta, `${o.key}: falta la etiqueta`);
      assert.ok((cfg.hechos[o.key] || []).length >= 1, `${o.key}: sin hechos cargados`);
    }
  });

  test(`Perfil ${nombre}: marca, redes y horario válidos`, () => {
    const m = cfg.marca;
    for (const k of ["nombre", "firma", "web", "tono", "publico"]) assert.ok(m[k], `falta marca.${k}`);
    assert.ok(m.redes.every((r) => ["instagram", "linkedin", "facebook"].includes(r)));
    assert.ok(m.horario.dias.every((d) => d >= 1 && d <= 7));
    assert.ok(Number.isInteger(m.horario.hora) && m.horario.hora >= 0 && m.horario.hora <= 23);
    assert.doesNotThrow(() => new Intl.DateTimeFormat("en", { timeZone: m.horario.zona }));
    assert.ok(m.angulos.length >= 3);
    if (m.redes.includes("facebook")) assert.match(m.fbPageId || "", /^\d+$/, "con facebook en redes hace falta fbPageId");
  });
}
