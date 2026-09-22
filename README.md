# Draw the room · powered by Higgsfield API

**Draw someone at this party. Let the room guess who.** Guests draw another person, photograph their drawing, and add a secret answer. Higgsfield API prepares the portrait artwork. It appears on the big screen without the name; the host reveals the answer after everyone has guessed.

This starter gives **each owner a separate app**, with their own saved parties and Higgsfield API account. A phone opens the upload link while a laptop, monitor, or laptop-connected TV displays the game.

## What it does

- Starts new worlds in party mode, with handmade or polished portraits and an optional **3D cartoon loop** after photo selection.
- Turns the animation choice into a colorful 3D cartoon still, then a five-second video that plays muted on repeat. The host's API account pays for both stages; animation takes longer than a still portrait.
- Uses Higgsfield API to prepare the artwork; the template presents the guessing game.
- Queues drawings automatically, shows one mystery portrait at a time, and saves the round between visits.
- Keeps names hidden in server responses until the host reveals them. Guests guess aloud; no guest accounts, scoring or voting setup.
- Provides separate owner, guest-upload, and display views.
- Gives the host **Reveal name** and **Next drawing** controls, plus rename, remove, pause uploads and replace invitation.
- Preserves aquarium, dinosaur and space worlds alongside the party game.
- Keeps API credentials on the server, outside the browser and shared links.

Use one clearly drawn person on plain paper per upload. Keep their name off the drawing and enter it separately in the answer field. The app uses the answer you supply; it does not identify people from images. The animated option is a rendered 3D cartoon video, not an interactive 3D model. Real generation takes processing time, and the loop's transition may be noticeable.

## Set up your own copy

Start with the [copyable ChatGPT setup prompt](docs/SETUP-PROMPT.md). Attach a downloaded copy of this repository, or provide its actual accessible link. You do not need to paste your API credentials into ChatGPT.

The intended host is ChatGPT Sites. You will need a Sites-enabled ChatGPT account, a Higgsfield API account, and API credentials entered in your own Site's private settings. See [deployment details](docs/DEPLOYMENT.md).

**Release status:** the [reference app](https://higgsfield-drawing-worlds.higgsfield-i-1075.chatgpt.site) is live with party mode and the optional **3D cartoon loop**. A real animation completed in about 3 minutes 38 seconds and automatically played as a muted five-second loop. Earlier still portraits completed in about 45 and 31 seconds. These are observed timings, not speed guarantees. Anonymous queueing, host reveal, next drawing, and round persistence after refresh worked. Guest requests could not reveal answers or access the host's room list. Video and poster requests without a valid invitation or owner session were denied.

A 390px browser preview had no horizontal overflow, and a local server restart preserved the round. Automated checks, the production build, and independent review passed; see the [validation record](docs/VALIDATION.md) for exact coverage. The live test inputs were original digital illustrations. A separate owner's one-prompt setup, a photo of a paper drawing, and physical phone/TV use remain unverified.

## Play at a party

See the short [host and guest guide](docs/PLAY.md).

1. Sign in as the host and create a party.
2. Open its display view full-screen on your computer. Connect that computer to the TV or monitor if needed.
3. Share the upload QR code or guest link with the people you want to invite.
4. Each guest draws someone in the room, uploads the drawing, and enters that person's first name or nickname as the secret answer.
5. The first completed portrait appears automatically. Everyone guesses aloud. The host selects **Reveal name**, then **Next drawing**. Later portraits join the queue as they finish.

Keep the host controls on your own device and put the display view on the shared screen. The display and guest links cannot reveal answers. You can remove a drawing when necessary; removing the active drawing moves the game forward. No drawing skill is required—the imperfect portraits are part of the fun.

Guest uploads use the **owner's API account**. There are no application generation-count or spending quotas. The owner controls access through the guest link and the pause-uploads setting. Replacing a shared link is the way to stop that link being used again.

Keep guest and display links private to their intended audience. Anyone holding a guest link can use its upload permission; display access does not grant owner controls.

## Local development

Use a Node.js release compatible with the versions pinned in `package-lock.json` and install the pinned packages:

```sh
npm ci
cp .env.example .dev.vars
npm run build
npm run preview
```

Open `http://localhost:8787`. The example settings enable a local owner and demo generation only for localhost. Demo output exercises the app without calling Higgsfield and must never be described as an API-generated result. Do not expose that development server to the public internet.

To test real generation locally, disable `DEMO_MODE` and add your API credentials only to the ignored `.dev.vars` file. A real submission can incur provider charges. Keep local keys out of screenshots, logs, commits, and prompts.

Useful checks:

```sh
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

The Vite development server is for frontend work. The Wrangler preview runs the Worker and frontend together for application-flow verification.

## How it is built

React and Vite provide the interface. A Cloudflare Worker-compatible server handles permissions and Higgsfield requests. D1 stores worlds and generation state; R2 stores artwork. The build emits `dist/server/index.js`, `dist/client`, and `dist/.openai/hosting.json`, following the Sites artifact layout found in an OpenAI starter. Sites accepted this layout for the reference deployment.

Application bindings are `DB` for D1, `MEDIA` for R2, and `ASSETS` for static frontend files. This source can run in a compatible Worker environment, but production owner authentication is configured for the trusted identity supplied by Sites. Moving to another host requires a verified authentication adapter.

## Credits and license

The experience was inspired by [paper-aquarium](https://github.com/MrMoT9I/paper-aquarium). This starter does not include that project's code, fish models, or artwork. Its application code is available under the [MIT license](LICENSE). Higgsfield branding and API services, dependencies, and generated outputs remain subject to their respective terms.
