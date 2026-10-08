/**
 * Microagente: PROSPECTOR (agente 8)
 * ---------------------------------------------------------------
 * Una sola responsabilidad: encontrar negocios de belleza para contactar
 * y cargarlos en el panel. NO contacta a nadie (los DMs los manda Mariela).
 *
 * Todo esto es determinístico (sin IA) y se prueba con node --test:
 * qué buscar cada semana, cómo reservan (mirando su web), prioridad P1/P2/P3
 * del guion de contacto, gancho de venta y descartes.
 */
const AGENT = "prospector";

const TIPOS = ["peluquería", "centro de estética", "salón de uñas", "barbería", "pestañas y cejas"];
const ZONAS = [
  "Getafe", "Leganés", "Fuenlabrada", "Alcorcón", "Móstoles", "Parla",
  "Chamberí, Madrid", "Malasaña, Madrid", "Salamanca, Madrid", "Retiro, Madrid", "Chamartín, Madrid",
  "Arganzuela, Madrid", "Carabanchel, Madrid", "Usera, Madrid", "Moncloa, Madrid", "Tetuán, Madrid",
];
const BUSQUEDAS_POR_SEMANA = 6; // tope duro: nunca más que esto por corrida
const MAX_LEADS_POR_SEMANA = 20;
const POR_DIA = 5; // ritmo del guion: 5 al día

/** Combinaciones tipo+zona de esta semana. Rota sin repetir hasta agotar la lista. */
function busquedasDeLaSemana(semanaIso) {
  const combos = [];
  // Intercalar: cada zona con un tipo distinto, para que una semana no sean 6 peluquerías.
  for (let i = 0; i < TIPOS.length * ZONAS.length; i++) {
    combos.push({ tipo: TIPOS[i % TIPOS.length], zona: ZONAS[i % ZONAS.length] });
  }
  const start = (semanaIso * BUSQUEDAS_POR_SEMANA) % combos.length;
  return Array.from({ length: BUSQUEDAS_POR_SEMANA }, (_, k) => combos[(start + k) % combos.length]);
}

const PLATAFORMAS = [
  { re: /booksy\.com/i, nombre: "Booksy" },
  { re: /treatwell\./i, nombre: "Treatwell" },
  { re: /fresha\.com/i, nombre: "Fresha" },
  { re: /planity\.com/i, nombre: "Planity" },
];
const SISTEMAS_PROPIOS = /(bookitit|simplybook|calendly|setmore|timify|agendapro|reservio|koibox|flowww|salonized|square(up)?\.com\/appointments|acuityscheduling|youcanbook|citaprevia|reservaonline|widget-reserva|booking-widget)/i;
const NO_ES_PERFIL = new Set(["p", "reel", "reels", "explore", "stories", "tv", "accounts", "share", "direct", "about", "legal", "developer"]);

/** Mira el HTML de la web y dice cómo reservan y cuál es su Instagram. */
function analizarWeb(html, url = "") {
  const texto = String(html || "");
  const todo = `${url} ${texto}`;
  const plataforma = PLATAFORMAS.find((p) => p.re.test(todo));
  let reservas = null;
  if (plataforma) reservas = plataforma.nombre;
  else if (SISTEMAS_PROPIOS.test(todo)) reservas = "propio";
  else if (/wa\.me\/|api\.whatsapp\.com|whatsapp/i.test(texto)) reservas = "whatsapp";
  else if (/href=["']tel:/i.test(texto) || /ll[aá]m(a|en)nos/i.test(texto)) reservas = "telefono";

  let instagram = "";
  const re = /instagram\.com\/([A-Za-z0-9._]{2,30})/g;
  let m;
  while ((m = re.exec(texto))) {
    const h = m[1].replace(/\.$/, "");
    if (!NO_ES_PERFIL.has(h.toLowerCase())) {
      instagram = `@${h}`;
      break;
    }
  }
  return { reservas, instagram };
}

/** Prioridad del guion de contacto. null = no vale la pena cargarlo. */
function prioridad({ tieneWeb, reservas, ganchosFicha }) {
  if (!tieneWeb) return "P1";
  if (reservas === "telefono" || reservas === "whatsapp" || reservas === null) return "P1";
  if (["Booksy", "Treatwell", "Fresha", "Planity"].includes(reservas)) return "P2";
  if (reservas === "propio") return ganchosFicha.length ? "P3" : null; // ya resolvió reservas: solo si la ficha está floja
  return null;
}

/** Puntos flojos de la ficha de Google (sirven de gancho para el mensaje). */
function ganchosDeFicha(place) {
  const g = [];
  if (!place.regularOpeningHours) g.push("ficha de Google sin horario");
  const n = place.userRatingCount || 0;
  if (n < 15) g.push(`solo ${n} reseñas en Google`);
  else if ((place.rating || 5) < 4) g.push(`nota ${place.rating} en Google`);
  return g;
}

const MOTIVO = {
  sinWeb: "no tiene web: reservas por teléfono o mensajes",
  telefono: "en la web las citas se piden llamando",
  whatsapp: "en la web las citas se piden por WhatsApp",
  nada: "la web no tiene sistema de reservas",
};

function motivoDe({ tieneWeb, reservas }) {
  if (!tieneWeb) return MOTIVO.sinWeb;
  if (reservas === "telefono") return MOTIVO.telefono;
  if (reservas === "whatsapp") return MOTIVO.whatsapp;
  if (reservas === null) return MOTIVO.nada;
  if (reservas === "propio") return "tiene reservas propias en la web";
  return `reserva con ${reservas} (paga comisión y la manda a un directorio con su competencia)`;
}

/** ¿Qué le ofrecemos? Agenda si reserva a mano o con plataforma; ficha si ya tiene reservas propias. */
function ofertaPara(prio) {
  return prio === "P3" ? "Ficha de Google" : "Agenda Online";
}

const CADENAS = /(llongueras|marco aldany|jean louis david|provost|franck provost|toni ?& ?guy|camille albane|dessange|tony moly|no\+vello|carmen navarro|centros único|únicos? depilación|corporación dermoestética|dermoestetica|lasser|eva.?depilación|mascarell|the beauty concept|hairdreams|peluquerías? low ?cost|mi peluquería low)/i;

function normalizar(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

/** Descartes: cerrados, cadenas y repetidos (en el panel o en la misma corrida). */
function descartar(place, { vistos, nombresEnPanel, telefonosEnPanel, conteoNombres }) {
  if (place.businessStatus && place.businessStatus !== "OPERATIONAL") return "cerrado";
  const nombre = place.displayName?.text || "";
  if (CADENAS.test(nombre)) return "cadena";
  if ((conteoNombres.get(normalizar(nombre)) || 0) > 1) return "cadena (varias sucursales)";
  if (vistos.has(place.id)) return "ya visto";
  if (nombresEnPanel.has(normalizar(nombre))) return "ya está en el panel";
  const tel = normalizar(place.nationalPhoneNumber);
  if (tel && telefonosEnPanel.has(tel)) return "ya está en el panel";
  return null;
}

/** Sin Instagram no hay canal permitido (mail/WhatsApp en frío necesitan consentimiento). */
function tieneCanal(candidato) {
  return /^@[A-Za-z0-9._]{2,30}$/.test(candidato.instagram || "");
}

/** Días hábiles a partir de `desde` (incluido si es hábil). */
function diasHabiles(desde, cantidad) {
  const out = [];
  const d = new Date(`${desde}T12:00:00Z`);
  while (out.length < cantidad) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const ORDEN = { P1: 0, P2: 1, P3: 2 };

/**
 * Arma los leads finales: P1 primero, tope semanal, y reparte 5 por día hábil
 * (fechaProximaAccion), así Seguimientos y Jefe IA le dicen a quién toca cada día.
 */
function armarLeads(candidatos, hoy) {
  const ordenados = [...candidatos]
    .sort((a, b) => ORDEN[a.prio] - ORDEN[b.prio] || (b.instagram ? 1 : 0) - (a.instagram ? 1 : 0))
    .slice(0, MAX_LEADS_POR_SEMANA);
  const dias = diasHabiles(hoy, Math.ceil(ordenados.length / POR_DIA) || 1);
  return ordenados.map((c, i) => {
    const notas = [
      `${c.prio} — ${c.motivo}`,
      c.ganchos.length ? `Ganchos: ${c.ganchos.join(" · ")}` : "",
      c.direccion,
      c.telefono ? `Tel: ${c.telefono}` : "",
      c.web ? `Web: ${c.web}` : "Sin web",
      c.maps ? `Maps: ${c.maps}` : "",
      `Encontrado por el Prospector (${c.tipo} · ${c.zona}).`,
    ].filter(Boolean).join("\n");
    return {
      nombre: c.nombre,
      negocio: `${c.tipo[0].toUpperCase()}${c.tipo.slice(1)} · ${c.zona.replace(", Madrid", "")}`,
      contacto: c.instagram || c.telefono || c.web || "",
      oferta: ofertaPara(c.prio),
      estado: "nuevo",
      ultimaInteraccion: "",
      pidioPrecio: false,
      pidioDemo: false,
      intencionExplicita: false,
      proximaAccion: `Calentar ${c.instagram} (seguir + 2 me gusta); DM al día siguiente, sin link`,
      fechaProximaAccion: dias[Math.floor(i / POR_DIA)],
      notas,
      consentimiento: {},
      prioridadContacto: c.prio,
      fuente: AGENT,
      placeId: c.placeId,
    };
  });
}

module.exports = {
  AGENT, TIPOS, ZONAS, BUSQUEDAS_POR_SEMANA, MAX_LEADS_POR_SEMANA, POR_DIA,
  busquedasDeLaSemana, analizarWeb, tieneCanal, prioridad, ganchosDeFicha, motivoDe, ofertaPara, descartar, normalizar, diasHabiles, armarLeads,
};
