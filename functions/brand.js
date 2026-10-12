/**
 * Configuración por proyecto (marca, ofertas y módulos activos).
 * Sin archivo ni variables, queda la configuración original (Mariela).
 * Para otro proyecto: copiar functions/project.example.json a functions/project.json
 * y elegir los módulos con "features". Ver README, sección "Otro proyecto".
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
  // Redes donde publica el Community Manager (instagram, linkedin, facebook). Define qué textos redacta.
  redes: ["instagram", "linkedin"],
  // Id de la Página de Facebook (solo si "facebook" está en redes). No es secreto.
  fbPageId: "",
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
  // BRAND_PROYECTO: ruta de otro project.json (lo usan los tests para probar los perfiles de /proyectos).
  const archivo = process.env.BRAND_PROYECTO || path.join(__dirname, "project.json");
  try {
    return JSON.parse(fs.readFileSync(archivo, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return {};
    throw new Error(`${archivo} no es un JSON válido: ${e.message}`);
  }
}

// Los tests usan siempre la configuración original, sin importar el project.json de la carpeta.
const project = process.env.BRAND_SIN_PROYECTO === "1" ? {} : loadProject();
const brand = { ...DEFAULTS, ...(project.marca || {}) };
brand.horario = { ...DEFAULTS.horario, ...(project.marca?.horario || {}) };
if (project.hechos) brand.hechos = project.hechos;
if (project.alias) brand.alias = project.alias;
if (project.ofertasRedes) brand.ofertasRedes = project.ofertasRedes;

// Módulos opcionales. Vacío = todos. "leads" y "scoring" siempre están. Opciones: copy, seguimientos, redes, prospector.
// Se define con "features" en project.json (recomendado) o con FEATURES="copy,redes" en functions/.env.
// OJO: algunas versiones de firebase-tools no pasan el .env al decidir qué funciones publicar, por eso project.json.
const ALL = ["copy", "seguimientos", "redes", "prospector"];
const lista = (v) => (Array.isArray(v) ? v : String(v || "").split(",")).map((s) => String(s).trim().toLowerCase()).filter(Boolean);
const desdeEnv = lista(process.env.FEATURES);
const desdeProyecto = lista(project.features);
const enabled = desdeEnv.length ? desdeEnv : desdeProyecto.length ? desdeProyecto : ALL;
const feature = (name) => enabled.includes(name);

module.exports = { brand, feature, ALL };
