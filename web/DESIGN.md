# Hestia — Design System

Tokens live in [`src/styles/tokens.css`](src/styles/tokens.css) (CSS) and are mirrored in
[`src/design/tokens.ts`](src/design/tokens.ts) for canvas/WebGL code (globe + map) that can't read CSS variables.
**Change a value in both places.**

## What makes the reference sites work

| Site | What it does well | What we took |
|------|-------------------|--------------|
| **cursor.com** | Near-black canvas, low-contrast 1px borders instead of shadows, a single product visual carries the hero, monospace "eyebrow" labels, restrained color — accent used only where action is. | Dark canvas, hairline borders (`--color-border`), mono eyebrows (`.eyebrow`), accent rationing. |
| **discord.com** | Space/starfield imagery, one saturated signature color (blurple), big confident display type, pill-shaped CTAs with obvious hover lift. | Space theme, a signature "constellation" blue (`--color-constellation`), pill buttons with hover lift. |
| **microsoft.com** | Fluent: strict 4px spacing grid, predictable card/tile layouts, visible accessible focus rings, consistent elevation steps. | 4px spacing scale, `--focus-ring`, elevation scale, card pattern (`--surface-*`). |
| **apple.com** | Huge headline with negative tracking, one idea per viewport, generous whitespace, frosted translucent nav, 980px pill links, slow eased scroll/motion curves, 17px body text. | Display type scale with tight tracking, full-viewport hero, glass nav (`--nav-*`), `--radius-pill`, `--ease-standard`, 17px body. |

### Shared patterns across all four
1. **One focal point per screen.** The hero is one sentence + one visual.
2. **Color is rationed.** Neutrals do 90% of the work; accent = interaction or data.
3. **Type does the hierarchy, not boxes.** Size + weight + tracking, minimal decoration.
4. **Motion is slow and eased**, never bouncy.
5. **Sticky, minimal nav** with ≤ 5 items.

## Token summary

- **Color** — deep-space neutrals, *city-light amber* (`--color-accent`, matches lit cities on the night globe) for primary actions and data highs, *constellation blue* for links/routes/focus.
- **Data scale** — `--data-0` … `--data-4`, a sequential dark-indigo → amber ramp with rising lightness so it reads on a dark map and for color-blind users.
- **Type** — Geist Sans / Geist Mono. Fluid display sizes via `clamp()`.
- **Space** — 4px base (`--space-1` = 4px).
- **Radius** — 6 / 10 / 16 / 24 / pill.
- **Motion** — `--ease-standard` (Apple-like), `--ease-out` (snappy UI), durations 150–800ms; all disabled under `prefers-reduced-motion`.
