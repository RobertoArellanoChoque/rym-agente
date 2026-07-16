# RyM Agente — Guía de diseño

## Marca

**Identidad:** "recuperos ✓ mandatos" — checkmark en rojo vívido.

**Paleta:**
- `--primary`: oklch(0.61 0.24 27) — coral-rojo más claro y vívido que el original #E52713. Usado en: navegación activa, checkmark del logo, indicador "IA activa", brand stripe.
- `--accent-secondary`: oklch(0.66 0.18 60) — ámbar cálido. Rompe monocromatismo. Usado en: badges secundarios, highlights, chart-3.
- Semánticos: éxito (emerald), warning (amber), error (destructive rojo oscuro #B91C1C).

## Componentes

### Color tokens (app/globals.css)
- Todos los colores se definen como CSS variables en `:root` y `.dark`.
- Componentes referenciando hardcoded hex deben cambiar a `var(--primary)` o `currentColor`.
- Nunca escribir `#RRGGBB` en JSX; usar tokens.

### Dark mode
- Implementado: `.dark {}` en `app/globals.css` tiene el set completo de tokens (mismo hue que `:root`, lightness/chroma ajustados para fondo oscuro, AA 4.5:1 en todos los pares texto/fondo).
- Toggle nativo sin dependencias en `components/ui/theme-toggle.tsx`, montado en `IconRail`. Persiste en `localStorage` (`theme: "light" | "dark"`); un `<script>` inline en `app/layout.tsx` aplica la clase antes del primer paint para evitar FOUC.

### Tipografía
- **Headings:** Cabinet Grotesk (bold 700)
- **Body:** Instrument Sans (regular 400)
- **Data/Tables:** Geist Mono (monospace para números, fechas)
- Base 16px, line-height 1.5 (legibilidad).

### Iconos
- Lucide (stroke width 2, radius 2). No emojis.
- Usar `currentColor` para heredar color del contexto.

### Indicador "IA activa"
- **Estado real:** verde pulsante cuando hay streaming (ChatInterface) o polling con tareas "procesando" (TasksPanel).
- **Estado idle:** verde sólido sin animación.
- No siempre pulsando (ya no es decorativo).

## Decisiones

### Jul 2026: Estética "agente AI" (21st.dev)
- Nuevos tokens: `--success` (verde, reemplaza emerald hardcodeado), `--shadow-glow` (halo del primary), `--radius` 0.5→0.625rem.
- Primitivas de agente en `components/ai/` (markdown, suggestions, prompt-input, tool-card, message) — vendorizadas de 21st.dev Agent Elements, re-tokenizadas. ChatInterface quedó como container de lógica.
- Efectos: utility `shimmer` nativo de shadcn/tailwind.css (estados "pensando"/"ejecutando"), `tw-animate-css` para entradas escalonadas. Sin framer-motion.
- Sign-in: split panel con marca sobre `--sidebar` + form claro. Lógica Clerk intacta.

### Oct 2025: Paleta más viva
Cambio de `oklch(0.52 0.23 27)` a `oklch(0.61 0.24 27)` para coral-rojo más luminoso, más agéntico. Agregada paleta ámbar para variedad visual.

### Descartadas
- Agedrex branding (azul #0439D9, navy #011140) — consultoría anterior, nunca implementada. RyM rojo es la marca real.

## Accesibilidad
- Contraste: 4.5:1 mínimo (AA) entre textos y fondos.
- Sin información por color solo — siempre acompañada de icono/texto.
- Respeta `prefers-reduced-motion`.
