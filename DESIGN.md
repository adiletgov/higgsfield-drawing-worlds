---
version: alpha
name: Drawing Worlds
description: A sketchbook opens into a living illustrated world for shared drawing play.
colors:
  ink: "#163f49"
  muted: "#567079"
  primary: "#17675f"
  primary-hover: "#10564f"
  paper: "#f8faf4"
  surface: "#ffffff"
  lemon: "#f5e8a5"
  mint: "#e3f2e9"
  line: "#dce4de"
  danger: "#a63238"
  danger-soft: "#fff0ee"
  focus: "#226bc2"
  scroll-thumb: "#789a93"
  scroll-track: "#e8eee7"
  scroll-hover: "#456f68"
  scroll-active: "#244e48"
typography:
  display:
    fontFamily: "Trebuchet MS, Avenir Next Rounded, Arial Rounded MT Bold, sans-serif"
  body:
    fontFamily: "Avenir Next, Avenir, Segoe UI, sans-serif"
rounded:
  control: "12px"
  stage: "22px"
  dialog: "24px"
spacing:
  unit: "6px"
  page-max: "1500px"
components:
  button:
    rounded: "12px"
  dialog:
    rounded: "24px"
  stage:
    rounded: "22px"
---

# Drawing Worlds Design System

## Overview

The North Star is a museum drawing table beside a giant living diorama: tactile paper controls, an expressive headline, and a wide illustrated stage. The stage carries the personality. Controls stay familiar and quiet.

This is a product for hosts creating shared drawing worlds, participants uploading from phones, and audiences watching a shared display. The user brief specifies English, aquarium/dinosaur/space environments, photo-to-character generation, and an append-only population except explicit owner removal. No Japan-specific locale or market rules were requested. No geographic market assumption is made.

The three routes share one identity: `/` is the host studio, `/join/:id` is a focused mobile form, and `/world/:id` gives the illustrated world the entire screen. The signature is the window into a living illustration, paired with a small pinned invitation note. Do not convert this into a generic analytics dashboard, card grid, dark developer console, or marketing pricing page.

Runtime ownership is **Model B**: the semantic custom properties in `src/client/styles.css :root` are canonical. This document mirrors accepted token values and explains their role. Shared React primitives consume those properties. Original SVG scenes own their separate illustrative palette; those values do not define control semantics. No component library or remote font is used.

## Colors

Ink is the default text; muted is supporting prose. Deep evergreen primary is a clearly legible action against white. Lemon is the drawing-paper accent, mint is neutral positive context. Danger is reserved for removal, invitation replacement confirmation, and errors. Focus blue is intentionally distinct from scene colors.

The application shell is light. Three scene themes change only the illustrated stage; no theme changes the button hierarchy. Every surface inherits visible tokenized scrollbars; forced-color mode returns scrollbar painting to the browser. Decorative scene illustration retains its colors for recognizability.

## Typography

Trebuchet MS gives headings rounded, open, playful shapes without a font download or late layout shift. The display stack has platform rounded fallbacks; the body uses Avenir Next and Segoe UI for a legible friendly cadence. Body baseline is 15px with 1.55 line height; form inputs remain 15px or larger on phones. Utility labels are restrained uppercase with wide tracking. Names wrap rather than clip in editing and world headings.

## Layout

The host studio is a maximum 1500px document with 4.2% side margins. The stage is the dominant column; a 272px pinned invitation panel sits beside it. At 680px and below, the stage and invitation stack, and the invitation becomes a compact two-column panel. Forms keep natural document scrolling.

Only the dedicated display owns a 100dvh viewport. It has no forms or data tables. Its invitation sits over the lower corner with a reserved QR image footprint. Modal dialogs use a bounded internal scroller. Image geometry is reserved before load. The mobile upload is a maximum 540px single column with a visible selected-photo preview.

## Elevation & Depth

Scene depth comes from layered SVG geography, light rays, flora, and foreground textures. Control surfaces use fine borders and minimal shadow. The pinned note has a translucent paper tab. Native dialog top-layer/backdrop provides isolation; a soft backdrop is the only strong UI depth treatment.

## Shapes

Controls use the 12px radius. The stage uses 22px; modal dialogs use 24px. Tiny circular sketch marks and radio checks derive from the physical drawing theme. Do not give every content block its own rounded card. The world list is a compact shelf; resident rows are simple list items.

## Components

`ui.tsx` owns Button, Dialog, Notice, Loading, QR, Brand, ThemePicker, and icons. `WorldStage.tsx` owns the stage and authenticated character images. `api.ts` owns resource polling, titles, token capture, and unload warnings.

| Document token               | Runtime owner                           | Consumers                              |
| ---------------------------- | --------------------------------------- | -------------------------------------- |
| colors.*                     | matching `--*` properties in styles.css | shared controls, shell, notices, focus |
| typography.display           | `--font-display`                        | headings, brand, illustration captions |
| typography.body              | `--font-body`                           | forms, controls, supporting prose      |
| rounded.control/stage/dialog | `--radius-control/stage/dialog`         | Button, world frame, Dialog            |
| spacing.unit                 | `--space-unit`                          | documented rhythm                      |
| colors.scroll-*              | `--scroll-*`                            | global scrollbar baseline              |

Buttons combine primary, neutral, ghost, or danger emphasis with semantic labels. They reserve dimensions while busy and block duplicate actions. Hover uses a slight tonal change, focus a 3px ring, pressed a 1px movement, disabled reduced opacity plus native disabled behavior. Errors remain inline; Notice is a shared persistent live region rather than a transient toast.

Forms use real labels, native radio groups, a real file input, inline validation, and no browser validation bubbles. Theme choice is a visible native radio group; no select popup is needed. The shared app-owned Dialog wraps native `dialog.showModal()` for proven top-layer isolation, inert background, Escape, focus containment, and focus restoration. Serious confirmations focus their safe action.

Original icons use consistent 1.8px rounded strokes in a 24px viewbox. Text labels accompany consequential actions. Icon-only controls have accessible names.

Characters retain identity and position across snapshots. Their slow drift and small body movement communicate a living world. The stage has a pause control, and reduced motion disables drift, atmospheric motion, and interaction transitions. Three original SVG backgrounds, and three labeled sample drawings, are self-contained local assets.

Copy is warm, short, and specific. A preview session says local sample processing and never implies a live Higgsfield AI request. Progress describes real named states without fake percentages. No generation quotas, credit counters, or invented budget limits appear.

## Do's and Don'ts

- Do make the shared world the largest and most characteristic object on screen.
- Do preserve all existing characters while adding a new one or showing a failure.
- Do keep the upload journey understandable from a phone.
- Do visibly label sample imagery and demo processing.
- Don't expose bearer tokens in query strings, logs, or inline notifications.
- Don't imply local demo processing proves live Higgsfield AI integration.
- Don't reduce touch or keyboard usability for animation or decorative flourishes.
