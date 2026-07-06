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
- **Approach:** Restringido — 1 acento fuerte + neutros fríos
- **Primary:** `oklch(0.47 0.22 264)` = #0439D9 — azul eléctrico Agedrex. Botones, estados activos, focus rings, badges de prioridad
- **Sidebar bg:** `oklch(0.10 0.06 264)` = #011140 — navy Agedrex. Solo para sidebar/nav
- **Background:** `oklch(0.985 0.004 247)` = #F8FAFC — gris frío muy sutil
- **Surface/Cards:** `oklch(1 0 0)` = #FFFFFF — sin sombras, borde 1px
- **Border:** `oklch(0.90 0.006 247)` — visible pero sutil
- **Texto primario:** `oklch(0.14 0.02 264)` = #0F172A slate-900
- **Texto muted:** `oklch(0.51 0.03 264)` = #64748B slate-500
- **Semantic:** success `oklch(0.56 0.17 145)` #16A34A, warning `oklch(0.66 0.18 60)` #D97706, error `oklch(0.52 0.22 25)` #DC2626
- **Dark mode:** No aplicado en v1

## Spacing
- **Base unit:** 4px
- **Density:** Compacta para tablas de datos, cómoda para formularios y cards
- **Scale:** 2xs(2px) xs(4px) sm(8px) md(16px) lg(24px) xl(32px) 2xl(48px) 3xl(64px)

## Layout
- **Approach:** Grid disciplinado
- **Sidebar:** 240px fijo, navy #011140
- **Content:** flex-1, background #F8FAFC
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
