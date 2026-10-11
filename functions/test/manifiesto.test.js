const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

// Lo mismo que lee `firebase deploy`: funciones y claves (secretos) que declara el código.
// Firebase exige que existan TODAS las claves declaradas, aunque ninguna función las use.
const bin = path.join(__dirname, "..", "node_modules", "firebase-functions", "lib", "bin", "firebase-functions.js");

function manifiesto(env) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "manifiesto-")), "m.json");
  execFileSync(process.execPath, [bin, path.join(__dirname, "..")], {
    env: { ...process.env, GCLOUD_PROJECT: "prueba", FUNCTIONS_MANIFEST_OUTPUT_PATH: out, BRAND_SIN_PROYECTO: "", ...env },
    stdio: "ignore",
    timeout: 60000,
  });
  const m = JSON.parse(fs.readFileSync(out, "utf8"));
  return { funciones: Object.keys(m.endpoints).sort(), secretos: (m.params || []).filter((p) => p.type === "secret").map((p) => p.name).sort() };
}

test("Perfil sin LinkedIn: no declara sus claves ni sus funciones", { skip: !fs.existsSync(bin) }, () => {
  const m = manifiesto({ BRAND_PROYECTO: path.join(__dirname, "..", "..", "proyectos", "viajahoytips", "project.json"), FEATURES: "redes" });
  assert.deepEqual(m.secretos, ["IG_PAGE_TOKEN", "OPENAI_API_KEY"]);
  assert.ok(m.funciones.includes("redactorPosts") && m.funciones.includes("publicador"));
  assert.ok(!m.funciones.some((f) => /linkedin|prospector|copyComercial|seguimientos/i.test(f)));
});

test("Perfil por defecto: conserva LinkedIn y todas las funciones", { skip: !fs.existsSync(bin) }, () => {
  const m = manifiesto({ BRAND_SIN_PROYECTO: "1" });
  assert.deepEqual(m.secretos, ["IG_PAGE_TOKEN", "LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET", "OPENAI_API_KEY"]);
  assert.equal(m.funciones.length, 14);
});
