---
version: alpha
name: Draw the room
description: A portrait guessing game for adult parties, with cocktail napkins and a midnight projector stage.
colors:
  ink: "#232139"
  muted: "#746d7e"
  primary: "#8882ee"
  primary-hover: "#9e99f1"
  paper: "#fffaf1"
  surface: "#fffdfa"
  apricot: "#f2bc9b"
  pink: "#d66f91"
  accent-ink: "#5b53b5"
  mint: "#eeebfa"
  line: "#e4dde1"
  danger: "#a63238"
  danger-soft: "#fff0ee"
  focus: "#5b53b5"
  scroll-thumb: "#92879c"
  scroll-track: "#f0e9e7"
  scroll-hover: "#746580"
  scroll-active: "#51415d"
typography:
  display:
    fontFamily: "Avenir Next, Arial Black, Segoe UI, sans-serif"
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

# Draw the room Design System

## Overview

The North Star is a dinner party that turns into an unofficial portrait gallery: cocktail napkins, a projected mystery face, and friends making questionable guesses. The headline gives the whole premise: **Draw someone at this party.** The product serves adults gathering in person, with one host, phones for uploads, and a shared screen for guessing.

The current task explicitly approved replacing the children's aquarium emphasis with a party game. The `party` setting is the default for new rooms. Existing aquarium, dinosaur, and space rooms retain their worlds, characters, and scene behavior. The rename changes public-facing language; API identifiers and storage remain compatible.

All three routes are product surfaces: `/` is the host desk, `/join/:id` is a phone contribution form, and `/world/:id` is a display. The signature is a single caricature on a tilted cocktail napkin against midnight ink. The host desk echoes the display, with an apricot invitation alongside it. Keep the controls quiet and familiar.

English is the current UI language. No geographic market or Japanese locale was requested. No audience or compliance assumptions follow from language alone. Avoid children's classroom copy, generic SaaS metrics, colorful card grids, fake urgency, and a developer-console appearance.

Runtime ownership is **Model B**: `src/client/styles.css :root` owns semantic tokens; this file mirrors exact accepted values and explains their role. Shared controls consume those variables. Original SVG artwork owns its separate illustration palette. No third-party font, imagery, or UI dependency is introduced.

## Colors

Midnight ink `#232139` anchors text and the projector stage. Electric periwinkle `#8882ee` marks safe primary actions with dark ink text; it is not paired with small white button text. Darker accent ink `#5b53b5` is used for small colored text on warm paper. Apricot `#f2bc9b` is the invitation/napkin accent, and pink `#d66f91` is a restrained expressive mark. Warm white `#fffaf1` keeps the surrounding product readable.

The legacy `--lemon` name is a compatibility alias of `--apricot`. The legacy `--mint` token is now pale lavender `#eeebfa`, used as the neutral information and selection surface. These aliases avoid duplicating component systems while previous scenes remain available. Danger, focus, disabled, and error meanings remain consistent across all settings.

The shell is light; the party stage is dark. Legacy themes change illustration, not control semantics. All application scrollbars use one tokenized baseline. Forced-color mode yields scrollbar colors to the operating system; artwork retains its original palette.

## Typography

Avenir Next and a heavy system sans-serif fallback give the headline an adult, conversational poster quality. The display stack is `Avenir Next, Arial Black, Segoe UI, sans-serif`; the body is `Avenir Next, Avenir, Segoe UI, sans-serif`. System fonts avoid late downloads and layout shifts. Display headings use tight tracking and substantial weight; supporting copy stays small and quiet.

Answer text is large enough to read across a room. Long answers wrap within the stage instead of clipping. Eyebrows identify the round or task; they never expose an unrevealed name. Native script fallbacks remain available for guest-entered names.

## Layout

The host document uses a 1500px maximum with 4.2% side margins. A wide stage is paired with a 285px invitation panel; host controls sit immediately below the stage. The host can see the same mystery state as the audience and act without scrolling to a separate settings page. Rooms and drawings live in compact shelves/lists below.

The dedicated display owns `100dvh`. On a wide screen, one large napkin portrait and the guessing question sit side by side, with the QR invitation in the lower corner. Narrow/short displays stack the portrait and question and retain access to the invitation. The photo upload is a 540px maximum document; its instructions, file input, secret answer, and finish choice remain in natural flow.

At 680px and below, the host stage and invitation stack. Host action buttons remain a pair of full-width controls. Modal content scrolls within safe viewport bounds. Photos and QR images reserve dimensions. Ordinary forms never inherit display viewport clipping.

## Elevation & Depth

The projector stage has a low-contrast cone of light, sparse line drawings of glasses, and minimal confetti at the edges. A lightly rotated paper surface creates the central physical reference. It carries a subtle shadow and dashed inner edge, rather than a generic floating dashboard card.

Utility surfaces use thin borders and modest depth. The invitation has a translucent tape tab. Native dialog top-layer isolation and one soft backdrop create the only strong UI overlay.

## Shapes

Controls retain 12px radius, the stage 22px, and dialogs 24px. Napkin edges stay rectangular to distinguish the artwork from controls. The brand mark is a small, rotated pencil tile. Do not repeat napkin styling around every field or list item.

## Components

`ui.tsx` owns shared Button, Dialog, Notice, Loading, QR, Brand, ThemePicker, and icons. `PartyStage.tsx` owns the mystery portrait and public answer presentation. `PartyControls.tsx` owns host round transitions. `party.ts` derives safe visible/accessibility labels and action eligibility from the server state. `CharacterMedia.tsx` owns authenticated image, poster, and looping-video presentation; `playback.ts` owns cancellable playback intent. `WorldStage.tsx` retains legacy living worlds. `api.ts` owns resource polling, token capture, titles, and unload warnings.

| Document token               | Runtime owner                              | Consumers                                      |
| ---------------------------- | ------------------------------------------ | ---------------------------------------------- |
| colors.*                     | matching custom properties in styles.css   | controls, shell, notices, focus, stage accents |
| colors.apricot               | `--apricot`, compatibility alias `--lemon` | invitation, paper detail, step markers         |
| typography.display           | `--font-display`                           | brand, headline, round question/answer         |
| typography.body              | `--font-body`                              | forms, controls, supporting prose              |
| rounded.control/stage/dialog | `--radius-control/stage/dialog`            | Button, stage frame, Dialog                    |
| colors.scroll-*              | global `--scroll-*`                        | every product scroll surface                   |

Buttons preserve dimensions while busy, use native disabled behavior, and retain visible keyboard focus. A shared Notice provides persistent status/error feedback. Names and progress are text, never color-only state. The answer is absent from the stage title and image accessibility label until reveal. The server also redacts it, including owner and job responses.

The host has **Reveal name**, followed by **Next drawing**. The display and guest page never include these actions. Before reveal, the napkin is headed **Who is it?** After reveal, the answer appears in apricot. The queue count is a real number of ready drawings waiting behind the current round, not a quota.

The secret-answer field is masked by default with a keyboard-operable Show/Hide action. The guest is explicitly told to keep the name off the drawing. Native radio groups choose the finish and setting. After a photo is selected in a party, a third finish, **3D cartoon loop**, appears as one full-width row beneath the two still finishes. It produces a colorful 3D portrait and a five-second video that repeats. The extra processing time and image-plus-video API cost are explained before submission. Selection alone starts no generation. The shared app-owned dialog wraps native `showModal()` for inert background, focus containment, Escape, and focus restoration.

The napkin has only a slow, subtle drift. A pause control is available and reduced motion disables it. A completed cartoon video fills the same napkin as a still portrait, remains muted, and loops inline. A quiet play/pause button sits on the media; reduced motion starts with the still poster until the viewer explicitly plays it. Global pause also pauses video. Poster images keep the portrait visible while video loads or autoplay is blocked. Queue thumbnails and legacy scenes use the poster instead of autoplaying many videos. The projector does not move the active portrait out of frame. The legacy scenes keep their slow character motion. Preview processing and illustrative sample artwork remain clearly labeled; local preview does not pretend to generate video.

Copy is adult, sociable, and gently self-deprecating: “Good company. Questionable portraits.” Instructions remain literal and short. No score rules, timers, winner mechanics, quotas, or costs are invented. The only billing text explains that the host pays for live generation and that uncertain retries must avoid duplicate paid requests.

## Do's and Don'ts

- Do make the game premise immediately clear.
- Do show one mystery drawing prominently and keep unrevealed names out of visible and accessible labels.
- Do keep the shared display independent from host controls.
- Do preserve previous drawings and legacy worlds.
- Do keep the secret answer off the photographed paper.
- Don't imply sample processing or illustration is a live AI output.
- Don't put keys, tokens, or hidden answers in diagnostic status messages.
- Don't replace server authorization or guarded round transitions with UI-only checks.
