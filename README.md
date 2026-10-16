# CRM Leads · Lead Scoring

Panel privado para cargar oportunidades comerciales y ver **cuáles merecen atención hoy**.

Es el primer microagente de un sistema de agentes pequeños coordinados por un "Jefe IA":
cada agente hace **una sola cosa**, se puede apagar sin romper el resto y explica cada decisión.

![stack](https://img.shields.io/badge/React-19-61dafb) ![stack](https://img.shields.io/badge/Firebase-Functions%20v2-ffca28) ![stack](https://img.shields.io/badge/Scoring-sin%20IA-e8610a)

## Qué hace

- **CRM Leads**: alta, edición y borrado de leads con un modelo mínimo (12 campos).
- **Lead Scoring**: clasifica cada lead en Alta / Media / Baja con reglas fijas y dice **por qué**.
- **Oportunidades de hoy**: lista ordenada, lista para que un coordinador (Jefe IA) la consuma.

El agente de scoring **solo clasifica**: no manda mensajes, no agenda, no cambia estados.

## Reglas de scoring (`functions/lead-scoring-rules.js`)

| Señal | Puntos |
|---|---|
| Pidió precio | +5 |
| Pidió demo | +5 |
| Espera mi respuesta | +5 |
| Intención clara de compra | +5 |
| Próxima acción vencida o en ≤ 2 días | +4 |
| Oferta activa (buen encaje) | +3 |
| Interacción en los últimos 3 días | +2 |
| Más de 30 días sin interacción | −4 |
| Sin oferta / necesidad clara | −2 |

**Alta ≥ 10 · Media 4–9 · Baja < 4.** Ganados y perdidos quedan fuera.
Si faltan datos, **no se inventan**: se listan como faltantes y esa señal no suma.

## Arquitectura

```
Panel (React + Vite + Tailwind)
   │  ID token de Firebase Auth
   ▼
Cloud Functions (codebase "leads")
   ├─ leadsApi     → CRUD en Firestore: crmLeads/{uid}/leads
   ├─ leadScoring  → "Oportunidades de hoy" (solo lectura)
   ├─ seguimientos → qué seguimientos mirar hoy, sin repetir avisos
   └─ copyComercial → borrador de email/WhatsApp para un lead (no envía nada)
          ▲
          └── Jefe IA (coordinador) lo consulta
```

- El panel no toca Firestore directo: todo pasa por funciones que validan el login y el email.
- Codebase de Functions separado: se despliega sin tocar otras funciones del proyecto.
- Observabilidad: cada error devuelve y loguea el nombre del agente que falló.

## Microagente Seguimientos (`functions/followup-rules.js`)

Junta tareas en espera del tablero y leads en espera. Vuelve a avisar un seguimiento **solo** si es nuevo, cambió, vence hoy/venció o pasaron 3 días sin novedades. Si nada cambió, se calla: "Tenés 12 pendientes, ninguno cambió".

## Microagente Copy Comercial (`functions/copy-rules.js`)

Botón "Redactar mensaje" en cada lead guardado. Las reglas fijas deciden si hay datos suficientes y qué objetivo tiene el mensaje según el estado; el modelo solo redacta, con los hechos reales de la oferta (no puede inventar precios ni detalles). Devuelve un borrador para copiar o abrir en WhatsApp: **nunca envía nada**.

## Configuración

1. `.env` en la raíz (copiar `.env.example`).
2. `functions/.env` (copiar `functions/.env.example`): emails permitidos, orígenes CORS y ofertas activas.
3. `.firebaserc` (copiar `.firebaserc.example`).
4. En Firebase → Authentication → Settings → Dominios autorizados: agregar el dominio del panel.

## Otro proyecto (mismo código, otro Firebase)

Cada proyecto tiene su propio Firebase y sus propios datos. Se usa el mismo repo, clonado una vez por proyecto:

1. Crear el proyecto en Firebase (Auth con Google, Firestore, Hosting, Functions) y el secreto `OPENAI_API_KEY`.
2. Completar `.env`, `functions/.env` y `.firebaserc` con los datos de ese proyecto y los emails permitidos.
3. Copiar `functions/project.example.json` a `functions/project.json`: nombre, firma, web, URL del panel y los **hechos de cada oferta** (el redactor solo puede afirmar lo que esté ahí). Sin este archivo queda la configuración de Mariela.
4. Elegir módulos con `features` en `project.json` (ej. `["redes"]`; vale también `FEATURES` en functions/.env, pero algunas versiones de firebase-tools no lo leen al publicar) y `VITE_FEATURES` en el `.env` de la raíz (visibilidad en el panel). Siempre están CRM, scoring y seguimientos; opcionales: `copy`, `redes` (Community Manager + Publicador), `linkedin` (solo en el panel; acompaña a `redes`), `prospector` (solo sirve para negocios de belleza). Ej.: `FEATURES="copy"`.
   - **YouTube por API** (opcional): `"youtubeApi": true` dentro de `marca` en `project.json`. Antes de publicar, correr `Guardar claves YouTube.bat` (Client ID/Secret de Google Cloud, permiso `youtube.upload`, redirect `https://us-central1-<proyecto>.cloudfunctions.net/youtubeCallback`). Los videos suben **privados y bloqueados** hasta que Google audite el proyecto: hay que resubirlos a mano desde Studio.
   Perfiles ya armados en `proyectos/` (ej. `proyectos/viajahoytips/project.json`: copiarlo a `functions/project.json`). Además de marca y ofertas, `project.json` define `tono`, `redes`, `horario` (días, hora, zona), `angulos` y `pinRegla`. Si hay más temas que días de publicación, rotan semana a semana.
5. `firebase use <proyecto>` y publicar. Las mejoras de código se traen con `git pull` en cada clon.

## Uso

```
npm install
npm run dev      # panel en http://localhost:3000
npm test         # tests del scoring (casos A–E)
```

## Publicar

`Publicar leads.bat` (Windows): instala, corre los tests, compila y despliega hosting + funciones.
Si falla un test o el build, no publica nada.
