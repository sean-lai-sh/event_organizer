# Event Organizer Design System

This document is the source of truth for frontend visual consistency and layout behavior.
It complements `AGENTS.md` and does not replace `PLAN.md` for data contracts.

## Scope

- Dashboard shell and navigation
- Auth surface layout
- Typography and spacing rhythm
- Interaction states (hover, active, focus)
- Component-level styling primitives

## Dashboard Core Layout

### Structural Frame

- Sidebar width: `256px` (`w-64`)
- Sidebar top row height: `72px`
- Content header height: `72px`
- Content header and sidebar top row must stay equal height
- Main content gutter: `px-7`
- Main content vertical inset: `py-4`

### Shared Components

- Dashboard pages must use `components/dashboard/PageShell.tsx`
- Sidebar nav must be defined in `app/dashboard/layout.tsx`
- Navigation actions (manage/sign-out) must be defined in `components/DashboardNav.tsx`

Avoid per-page ad hoc header wrappers unless intentionally introducing a new global pattern.

## Typography

- Page title (dashboard shell): `text-lg`, `font-semibold`, subtle tracking
- Sidebar brand: `text-[14px]`, `font-semibold`
- Nav labels: `text-[13px]`
- Supporting text: `text-[12px]` or `text-[13px]`

Typography should prioritize legibility and predictable hierarchy over display flair in app surfaces.

## Navigation Rules

- Use `lucide-react` icons only for sidebar navigation
- Icon size: `h-4 w-4`
- Active state must be visibly stronger than hover:
  - Active: stronger bg + border + text contrast
  - Hover: clear but lower contrast than active
- Active state should be unambiguous at a glance

## Color + Surfaces

- Monochrome-first palette:
  - Primary text: `#0A0A0A` / `#111111`
  - Secondary text: `#555555`
  - Muted text: `#999999`
  - Disabled text: `#BBBBBB`
  - Divider: `#EBEBEB`
  - Input/card border: `#E0E0E0`
  - Page bg: `#FAFAFA`
  - Panel bg: `#FFFFFF` / `#F4F4F4`

## Component Consistency

- Inputs: `h-10` or `h-11`, `rounded-[8px]`, inside border, no heavy shadow
- Cards: `rounded-[14px]`, thin border, white fill
- Tables: consistent header row height (`h-10`) and row spacing
- Buttons:
  - Secondary app actions should default to outlined monochrome
  - High-emphasis destructive/auth actions should not dominate utility navigation zones

## Shadcn Baseline

- Preset source of truth: `fe+convex/components.json` must use `style: "radix-vega"` for generated components.
- Shared shadcn semantic tokens must be defined in `fe+convex/app/globals.css` and remain monochrome-first:
  - `background`: `#FAFAFA`
  - `foreground`: `#111111`
  - `card`: `#FFFFFF`
  - `popover`: `#F4F4F4`
  - `border` / `input`: `#E0E0E0`
  - `primary`: `#0A0A0A`
  - `primary-foreground`: `#FFFFFF`
  - `muted-foreground`: `#999999`
  - `ring`: `#0A0A0A`
  - `radius`: `8px`
- Default primitive behavior requirements:
  - `Button`: monochrome variants, default control height `44px`, radius `8px`
  - `Dialog`: centered modal, monochrome overlay/surface, Pencil typography hierarchy
  - `Tabs`: strong active highlight, monochrome inactive state, radius `8px`
- New dashboard/auth interfaces should prefer shared shadcn primitives over per-page ad hoc class stacks.

## Interaction + Motion

- Use subtle transitions (`transition`, 120-200ms feel)
- Avoid excessive animation in dashboard surfaces
- Keep hover/active/focus states crisp and functional

## Change Policy

When updating dashboard visuals:

1. Update shared primitives first (`PageShell`, sidebar, nav actions)
2. Apply changes across all dashboard pages for parity
3. Verify alignment:
   - Top row height parity (sidebar/content)
   - Nav state contrast
   - Gutter consistency
4. If a new global pattern is introduced, update this file in the same change
