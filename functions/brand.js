/**
 * Configuración por proyecto (marca, ofertas y módulos activos).
 * Sin archivo ni variables, queda la configuración original (Mariela).
 * Para otro proyecto: copiar functions/project.example.json a functions/project.json
 * y poner FEATURES en functions/.env. Ver README, sección "Otro proyecto".
 */
const fs = require("node:fs");
const path = require("node:path");

const DEFAULTS = {
  nombre: "Mariela Cardinale",
  firma: "Mariela",
  web: "marielacardinale.com",
  panelUrl: "https://marielacardinale-leads.web.app",
  igUserId: "17841458234882016",
  // Frase para los prompts de redes: a quién le vende el proyecto.
  publico: "negocios locales en España: estudios de belleza, peluquerías, centros de estética",
  // Cómo habla el redactor (copy y posts).
  tono: 'Español de España (tú, "cita", "reserva", "señal")',
  // Redes donde publica el Community Manager (instagram, linkedin). Define qué textos redacta.
  redes: ["instagram", "linkedin"],
  // Cuándo salen los posts: días de la semana (1 = lunes), hora y zona horaria.
  horario: { dias: [1, 3, 5], hora: 10, zona: "Europe/Madrid" },
  // null = usar los textos originales de posts-rules.js
  angulos: null,
  pinRegla: null,
  // null = usar los textos originales de copy-rules.js / posts-rules.js
  hechos: null,
  alias: null,
  ofertasRedes: null,
};

function loadProject() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "project.json"), "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return {};
    throw new Error(`functions/project.json no es un JSON válido: ${e.message}`);
  }
}

const project = loadProject();
const brand = { ...DEFAULTS, ...(project.marca || {}) };
brand.horario = { ...DEFAULTS.horario, ...(project.marca?.horario || {}) };
if (project.hechos) brand.hechos = project.hechos;
if (project.alias) brand.alias = project.alias;
if (project.ofertasRedes) brand.ofertasRedes = project.ofertasRedes;

// Módulos opcionales. FEATURES="copy,seguimientos" (vacío = todos, como hasta ahora).
// "leads" y "scoring" siempre están. Opciones: copy, seguimientos, redes, prospector.
const ALL = ["copy", "seguimientos", "redes", "prospector"];
const raw = String(process.env.FEATURES || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const enabled = raw.length ? raw : ALL;
const feature = (name) => enabled.includes(name);

module.exports = { brand, feature, ALL };
