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
   └─ leadScoring  → "Oportunidades de hoy" (solo lectura)
          ▲
          └── Jefe IA (coordinador) lo consulta
```

- El panel no toca Firestore directo: todo pasa por funciones que validan el login y el email.
- Codebase de Functions separado: se despliega sin tocar otras funciones del proyecto.
- Observabilidad: cada error devuelve y loguea el nombre del agente que falló.

## Configuración

1. `.env` en la raíz (copiar `.env.example`).
2. `functions/.env` (copiar `functions/.env.example`): emails permitidos, orígenes CORS y ofertas activas.
3. `.firebaserc` (copiar `.firebaserc.example`).
4. En Firebase → Authentication → Settings → Dominios autorizados: agregar el dominio del panel.

## Uso

```
npm install
npm run dev      # panel en http://localhost:3000
npm test         # tests del scoring (casos A–E)
```

## Publicar

`Publicar leads.bat` (Windows): instala, corre los tests, compila y despliega hosting + funciones.
Si falla un test o el build, no publica nada.
