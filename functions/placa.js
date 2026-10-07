/**
 * Placa automática para posts (imagen 1080x1350, formato 4:5 de Instagram).
 * Gratis y determinística: mismo texto → misma imagen. Sin IA.
 */
const fs = require("node:fs");
const path = require("node:path");
const { Resvg } = require("@resvg/resvg-js");

const W = 1080;
const H = 1350;
const COLORS = { fondo: "#FFF8F0", naranja: "#E8610A", texto: "#1a1a1a", suave: "#6b5d54", borde: "#F5C9A8" };

const fontDir = path.dirname(require.resolve("@fontsource/poppins/package.json"));
const FONTS = [
  { name: "Poppins", weight: 700, style: "normal", data: fs.readFileSync(path.join(fontDir, "files/poppins-latin-700-normal.woff")) },
  { name: "Poppins", weight: 500, style: "normal", data: fs.readFileSync(path.join(fontDir, "files/poppins-latin-500-normal.woff")) },
];

const h = (type, style, children) => ({ type, props: { style, children } });

/** Achica la letra si el título es largo, para que nunca se corte. */
function titleSize(titulo) {
  const n = String(titulo || "").length;
  if (n <= 28) return 96;
  if (n <= 45) return 80;
  if (n <= 65) return 66;
  return 56;
}

function tree({ etiqueta, titulo, subtitulo }) {
  return h("div", {
    width: W, height: H, display: "flex", flexDirection: "column", justifyContent: "space-between",
    backgroundColor: COLORS.fondo, padding: "96px 88px", fontFamily: "Poppins",
  }, [
    h("div", { display: "flex", flexDirection: "column" }, [
      h("div", { display: "flex", width: 120, height: 14, backgroundColor: COLORS.naranja, borderRadius: 7, marginBottom: 48 }, []),
      h("div", { display: "flex", fontSize: 34, fontWeight: 500, color: COLORS.naranja, textTransform: "uppercase", letterSpacing: 2 }, String(etiqueta || "")),
    ]),
    h("div", { display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }, [
      h("div", { display: "flex", fontSize: titleSize(titulo), fontWeight: 700, color: COLORS.texto, lineHeight: 1.12 }, String(titulo || "")),
      subtitulo
        ? h("div", { display: "flex", fontSize: 44, fontWeight: 500, color: COLORS.suave, lineHeight: 1.35, marginTop: 44 }, String(subtitulo))
        : h("div", { display: "flex" }, []),
    ]),
    h("div", { display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `3px solid ${COLORS.borde}`, paddingTop: 36 }, [
      h("div", { display: "flex", fontSize: 34, fontWeight: 700, color: COLORS.texto }, "Mariela Cardinale"),
      h("div", { display: "flex", fontSize: 30, fontWeight: 500, color: COLORS.naranja }, "marielacardinale.com"),
    ]),
  ]);
}

/** Devuelve un Buffer PNG. */
async function renderPlaca(datos) {
  const { default: satori } = await import("satori");
  const svg = await satori(tree(datos), { width: W, height: H, fonts: FONTS });
  return new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
}

module.exports = { renderPlaca, W, H };
