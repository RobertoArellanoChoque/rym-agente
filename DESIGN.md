# Design System — RyM Agente

## Product Context
- **What this is:** SaaS de conciliación bancaria y automatización contable integrado con Tango ERP
- **Who it's for:** Contadores y administrativos de RyM (Recuperos y Mandatos), cliente de Agedrex
- **Space/industry:** Fintech/accounting software, mercado argentino, integración con ERP Tango
- **Project type:** Web app / dashboard SaaS

## Aesthetic Direction
- **Direction:** Industrial/Minimalista
- **Decoration level:** Mínima — tipografía y color hacen todo el trabajo
- **Mood:** El anti-Tango. Rápido de entender, sin distracciones, tan confiable como una planilla pero 10x más fácil de usar. El contador llega, hace la conciliación, se va.
- **Memorable:** "Esto es fácil y rápido"

## Typography
- **Display/Headings:** Cabinet Grotesk (Fontshare CDN) — carácter propio en un espacio donde todos usan Inter/Geist para headings
- **Body/UI:** Instrument Sans (Google Fonts via next/font) — más cálido que Geist puro, excelente legibilidad en interfaces de datos densas
- **Data/Tables:** Geist Mono — tabular-nums perfectos para números financieros
- **Code:** Geist Mono
- **Loading:** Cabinet Grotesk via `https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@800,700,500,400&display=swap`; Instrument Sans via `next/font/google`
- **CSS vars:** `--font-heading: var(--font-cabinet-grotesk)`, `--font-sans: var(--font-instrument-sans)`, `--font-mono: var(--font-geist-mono)`
- **Scale:** xs(12px) sm(14px) md(16px) lg(20px) xl(24px) 2xl(30px) 3xl(36px)

## Color
- **Approach:** Neutros cálidos tipo lino (base: theme "Claude" de 21st.dev, `@serafimcloud/themes/claude`) + rojo RyM como único acento fuerte
- **Primary:** `oklch(0.61 0.24 27)` — coral-rojo vívido RyM. Botones, estados activos, focus rings, item activo del sidebar
- **Background:** `#faf9f5` — lino cálido
- **Surface/Cards:** `#ffffff` — sin sombras, borde 1px (jerarquía card>fondo; Claude original usa card=bg)
- **Sidebar bg:** `#f5f4ee` — crema claro; activo en rojo RyM, hover `#e9e6dc`
- **Secondary/Muted/Accent:** `#e9e6dc` / `#ede9de` / `#e9e6dc` — cálidos Claude
- **Border:** `#dad9d4` — warm, visible pero sutil. Input `#b4b2a7`
- **Texto primario:** `#3d3929` (cards `#141413`)
- **Texto muted:** `#83827d`
- **Acento secundario:** `--accent-secondary` ámbar `oklch(0.66 0.18 60)` — rompe monocromatismo
- **Semantic:** success `oklch(0.50 0.15 150)`, destructive `oklch(0.44 0.18 25)` #B91C1C (se conserva rojo semántico, no el destructive negro de Claude — app financiera)
- **Charts:** hues propios rojo/verde/ámbar/azul/violeta (chart-1..5), no la paleta Claude
- **Dark mode:** cálido marrón-gris Claude — bg `#262624`, card/popover `#30302e`, sidebar `#1f1e1d`, primary RyM aclarado `oklch(0.70 0.19 27)`, borders en alpha blanco 10%

## Spacing
- **Base unit:** 4px
- **Density:** Compacta para tablas de datos, cómoda para formularios y cards
- **Scale:** 2xs(2px) xs(4px) sm(8px) md(16px) lg(24px) xl(32px) 2xl(48px) 3xl(64px)

## Layout
- **Approach:** Grid disciplinado
- **Sidebar:** rail colapsable 56px → 192px, crema #f5f4ee (`--sidebar`)
- **Content:** flex-1, background lino #faf9f5
- **Two-panel (módulos con chat):** 60/40 split
- **Max content width:** 1024px (max-w-5xl)
- **Border radius:** sm(4px) md(8px) lg(10px) — sin bordes bubble

## Motion
- **Approach:** Mínimo-funcional
- **Solo:** fade de resultados al completar conciliación, skeleton durante carga
- **Easing:** ease-out para entradas, ease-in para salidas
- **Duration:** micro(100ms) short(200ms)

## Decisiones Log
| Fecha | Decisión | Rationale |
|-------|----------|-----------|
| 2026-06-27 | Sistema de diseño inicial | /design-consultation. SaaS para RyM, Agedrex brand aplicada, memorable: fácil y rápido |
| 2026-06-27 | No box-shadow en cards | Velocidad visual, borde 1px más limpio |
| 2026-06-27 | Navy sidebar en lugar de charcoal genérico | Identidad Agedrex inmediata vs. aspecto genérico SaaS |
| 2026-06-27 | Cabinet Grotesk para headings | Diferenciación: nadie en el espacio ERP/contabilidad la usa |
| 2026-06-27 | Instrument Sans para body | Más cálido y legible que Geist puro en interfaces densas |
| 2026-07-15 | Neutros cálidos theme Claude (21st.dev @serafimcloud) | Reemplaza slate frío; lino #faf9f5 + warm grays. Marca RyM (rojo hue 27) se mantiene en primary/ring/activos |
| 2026-07-15 | Sidebar claro #f5f4ee (revierte navy/slate oscuro) | Look completo Claude en light mode; activo sigue en rojo RyM con texto blanco |
| 2026-07-15 | Dark mode cálido #262624 | Ya existía dark slate; se migra a marrón-gris Claude, primary RyM aclarado |
| 2026-07-15 | Destructive sigue rojo #B91C1C, charts con hues propios | Claude usa destructive negro y charts terracotta/violeta; acá la semántica financiera manda |
