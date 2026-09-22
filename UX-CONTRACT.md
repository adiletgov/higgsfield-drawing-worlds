# Draw the room UX Contract

## Product context

Hosts run a portrait guessing game at an adult party. Guests draw someone in the room and contribute a photographed drawing plus a required secret answer from their phone; audiences guess on a separate full-screen display. The host reveals the answer and advances the round. New rooms default to party; existing aquarium, dinosaur, and space rooms remain available. English is the current UI locale. No geographic market is assumed. Dates are internal ISO values; no calendar control exists. Accessibility target is WCAG 2.2 AA using native semantics, keyboard access, and reduced-motion support.

## Business-context sources

| Scope                                               | Authoritative source                                  | Type                                   | Reviewed   |
| --------------------------------------------------- | ----------------------------------------------------- | -------------------------------------- | ---------- |
| World, character, job lifecycle and route roles     | `src/shared.ts`                                       | Domain/API contract                    | 2026-09-22 |
| Owner authentication, guest and display permissions | `src/server/` and `docs/DEPLOYMENT.md`                | Server enforcement/deployment contract | 2026-09-22 |
| Irreversible character removal                      | DELETE endpoint in `src/shared.ts`                    | API contract                           | 2026-09-22 |
| Paid generation and uncertain request handling      | `src/shared.ts`, `src/server/`                        | API contract/worker behavior           | 2026-09-22 |
| Product vocabulary and visual direction             | `docs/superpowers/plans/2026-09-22-drawing-worlds.md` | Approved task implementation plan      | 2026-09-22 |

The UI references these contracts rather than defining billing, retention, or permissions independently. No legal or geographic compliance claim is made.

## Visual contract

`DESIGN.md` records the visual intent. Canonical runtime tokens live in `src/client/styles.css`. The new original party SVG and sample portrait establish the cocktail-napkin/projector setting. Three legacy scene illustrations remain available. All controls retain the shared semantic colors and typography.

## Canonical UI Map

| Capability | Canonical owner                                                            | Source of truth                   | Allowed variants                      | Verification                      |
| ---------- | -------------------------------------------------------------------------- | --------------------------------- | ------------------------------------- | --------------------------------- |
| Form       | `WorldForm` in Owner.tsx; photo workflow in Join.tsx; shared Button/Notice | this contract and `src/shared.ts` | named-world form / guest contribution | browser validation and recovery   |
| Scrollbar  | global `src/client/styles.css`                                             | DESIGN.md                         | document / modal bounds               | computed style and narrow browser |
| Toast      | Notice in `src/client/ui.tsx`                                              | this contract                     | persistent information / error        | live-region inspection            |
| CRUD       | Owner in `src/client/Owner.tsx`, resource service in api.ts                | `src/shared.ts`                   | create / edit / remove                | API and browser flow              |

No table selection, date picker, search, or select/listbox exists. Theme and appearance use native radio groups with browser-owned arrow-key selection. There is no equivalent screen-local popup implementation.

## Dataset and navigation behavior

The API returns complete world lists and snapshots. Rooms render as a wrapping shelf; drawings are a semantic list. Party mode shows only the active mystery drawing prominently. Existing drawings remain stored and listed, without eviction or a population cap. Legacy scenes still show all their characters. The host document scrolls naturally. World selection is ephemeral host navigation, not a sensitive share URL. Bearer credentials are captured from URL fragments into sessionStorage per route role and world; fragment removal reduces accidental address-bar disclosure. No credential is placed in a query string.

Initial loading has an app-owned spinner with stable space. Refresh keeps the last good world visible. Empty-world imagery is visibly labeled illustrative sample. Authentication and missing world failures have owned recovery copy rather than blank screens. Owner sign-in/setup is separate from guest joining, and there are no secret-entry forms in the public app.

## Flow ledger

| Operation                | Pending                                                                | Success                                                                           | Failure recovery                                                                    | Source                                      |
| ------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------- |
| Create world             | stable busy button                                                     | close form, select new world, persistent acknowledgement                          | keep entered name/theme and inline error                                            | POST worlds, shared.ts                      |
| Save changes             | stable busy button                                                     | close form, retain current world, announce saved                                  | keep form and values open                                                           | PATCH world, shared.ts                      |
| Pause/open uploads       | disable mutation controls                                              | server-confirmed label/status                                                     | keep last known setting and error                                                   | PATCH world, shared.ts                      |
| Replace invitation       | safe-focused app dialog                                                | update QR/link, existing residents remain                                         | keep confirmation open and allow retry                                              | PATCH rotateGuest, shared.ts                |
| Remove character         | safe-focused app dialog, wait for server                               | remove only confirmed character                                                   | retain character and confirmation with retry                                        | DELETE character, shared.ts                 |
| Add drawing              | prepare photo, create job, show real status                            | completed character joins existing world                                          | retain input; explicit network retry reuses request identity                        | jobs endpoints, shared.ts                   |
| Resolve uncertain upload | safe-focused review confirmation, wait for server                      | mark reviewed upload as failed; guest can check status and choose another drawing | retain uncertain state and keep confirmation open with retry                        | owner PATCH job resolveUncertain, shared.ts |
| Reveal name              | disable host round actions and wait for guarded server acknowledgement | refetch snapshot; reveal current answer on host and display                       | retain prior screen and show inline error; refresh authoritative round before retry | PATCH party reveal, shared.ts               |
| Next drawing             | disable host round actions and wait for guarded server acknowledgement | next ready drawing or waiting screen                                              | stale active ID rejected; no automatic repeated advance                             | PATCH party next, shared.ts                 |
| Cancel edit              | check dirty state                                                      | safe focus restoration                                                            | discard confirmation or keep editing                                                | local form behavior                         |

## Overlays and feedback

The shared Dialog uses native `showModal()` but supplies the full app-owned content and actions. Native dialog provides modal focus containment and inert background. Opening captures the trigger; closing restores it. Escape behaves like Cancel unless a mutation is busy. Removing a character and replacing an invitation name the consequence, begin on the safe action, remain open on failure, and close only on success. No browser alert, confirm, or prompt is used.

Notice is persistent, contextual, and deduplicated as one string per operation/resource. Errors use alert; ordinary outcomes use polite status. No secrets are included. Dialogs use the browser top layer; application overlay levels use CSS tokens. Unsaved world forms warn through the same dialog content before discarding; actual page unload uses a narrow beforeunload guard for unsaved forms/photos.

## Async and resilience

Mutations are pessimistic. Uploads use a UUID request identity reused for uncertain retries, persisted per world before POST where sessionStorage is available. The request-status lookup restores jobs after an interrupted response or refresh. It never triggers a new paid request automatically. Confirmed jobs also persist their job ID for re-open. Reset after a terminal result clears recovery keys and permits a new identity. If browser storage is unavailable, the form warns the participant to keep the page open.

Requests time out after 25 seconds, polling uses cancellation and finite exponential recovery after failure, and explicit retry remains available. The shared display checks for updates every second after each response so reveals feel immediate; the host retains its 3.5-second background interval and refreshes directly after actions. Visibility return and online events revalidate snapshots. Unchanged character image URLs retain their blob and animation identity. Asset fetch validates a same-world API path before attaching Authorization. Images revoke object URLs on replacement/unmount. Character loading errors offer a local reload control.

A 401/403 stops automatic snapshot retry and explains that the invitation needs renewal; the server remains the permission authority. Last good snapshots stay visible on transient errors. Unknown paid results are labeled uncertain and require status checking/host review before a new submission. Progress is staged, never an invented percentage. This client does not offer optimistic billing, offline paid queuing, force overwrite, or a fictitious cancel of an already accepted provider job.

For an uncertain upload, the host can choose **Resolve upload** and then **Mark as reviewed** only after checking the request in Higgsfield API activity. The confirmation explicitly explains that closing app tracking neither cancels the provider job nor issues a refund, and a new upload starts another paid generation. The app sends the owner-only resolution request and updates the row only after acknowledgement. It never resubmits automatically. The guest’s **Check status again** action observes the reviewed failed state and makes **Choose another drawing** available; that explicit reset permits a new request identity.

## Party round contract

`Snapshot.party` exists only for party worlds. The client chooses the active drawing by `activeCharacterId`; `revealed` controls the public answer. `round` is the current one-based position and `total` is the count of completed playable drawings. The displayed ready queue is `max(0, total - round)`. Processing jobs are distinct from ready drawings. A final Next leaves an empty active identity; later completion automatically starts the next available drawing.

Reveal and Next include the captured active drawing ID. Next is disabled until reveal. The server rejects stale or repeated transitions without skipping drawings. PartyControls scopes pending work to the current world and invalidates responses on world switch/unmount. After a transition it requests a fresh snapshot, since the answer is server-redacted until reveal. The shared resource publication gate invalidates pre-mutation background reads before committing a mutation snapshot, so a delayed poll or error cannot overwrite it. Host removal also awaits a complete authoritative snapshot instead of locally filtering a character while leaving its round behind. A response cannot overwrite another selected room. Do not compare round numbers as monotonic versions: moderation removal can renumber the surviving queue. An already revealed active drawing cannot be reset to unrevealed by a delayed same-drawing response.

Host moderation can remove a drawing. Removing the current drawing advances to the next available drawing without revealing the removed answer; confirmation states this consequence. No scores, timers, winners, or automatic paid resubmissions are part of this game.

## Validation

Party submissions require a nonblank secret answer. The field is masked with an accessible Show/Hide button, and instructions say to keep the name off the paper. Guest completion copy does not echo the answer. Forms own validation with noValidate. Name errors are text-associated with the field, expose aria-invalid, and focus the first error. File decoding and canvas resampling generate a PNG no larger than 1024px on the longest edge, stripping metadata. The browser safety boundary is 25 MB per input photo, distinct from generation quotas; server validation remains authoritative. Upload state survives connection errors. Native file selection supports keyboard, touch, and drag/drop alternatives. Appearance is a native radio group. IME input uses native field/form behavior, without custom Enter shortcuts.

## Permission and clipboard

Owner mutations appear only at the authenticated host desk. Reveal name and Next drawing are never rendered on the shared display or guest page. The server redacts each drawing and job name as Mystery guest until that specific drawing is revealed, including owner responses. The client adds a second presentation guard: unrevealed portraits use Mystery party portrait as their accessible label. Guest controls disable while paused or generation setup is unavailable and explain why. The display shares the guest upload QR intentionally. Copying the invitation requires an explicit click and reports success without echoing the token; denial leaves a link-copy alternative. No API credential, owner authentication secret, or financial commitment can be entered through the guest UI. A party answer is participant-supplied game data, separately masked and server-redacted until reveal.

## Verification

Static contract audit: `python3 <frontend-design-premium>/scripts/audit_project.py . --mode strict`.

Project commands: `npm run typecheck`, `npm test`, `npm run build`, `npm run format:check`, and `node --test src/client/logic.check.mjs src/client/party.check.mjs`. Frontend unit checks independently verify image sizing, exact route parsing, fragment-only share credentials, and same-world authenticated asset scope. Party checks verify that unrevealed answers never become visible/accessibility labels, reveal enables only the next action, and missing/stale active identities disable round actions.

Browser verification should cover desktop and narrow host, guest and display views; create and rename, party plus all three legacy settings, pause/open, replaced invitation, upload completed/failed/uncertain, retained drawings, required secret answer, redacted labels, reveal then next, queue exhaustion and late arrivals, app dialog Escape/focus, refresh recovery, offline snapshot preservation, reduced motion, and keyboard-only form entry. The sibling comparison is host create/edit and guest upload using shared controls and feedback. Root task integration owns the browser evidence report; no static audit is treated as runtime proof.
