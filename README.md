# Higgsfield Drawing Worlds

Turn a drawing on paper into an illustrated character in a shared world. Choose an aquarium, dinosaur park, or space scene; upload one character; and watch it join the characters already on screen.

This starter is designed to give **each owner a separate app**, with their own saved worlds and Higgsfield API account. A phone opens the upload link while a laptop, monitor, or laptop-connected TV displays the world.

## What it does

- Offers handmade and polished character appearances.
- Uses Higgsfield API to prepare character artwork; the app animates the resulting illustration.
- Keeps multiple characters together and saves worlds between visits.
- Provides separate owner, guest-upload, and display views.
- Lets the owner rename a world, change its theme, remove a character, pause uploads, or replace the guest link.
- Keeps API credentials on the server, outside the browser and shared links.

These are animated illustrations, not generated 3D models. Use one clearly drawn character on plain paper per upload. Real generation takes processing time; this project makes no instant-generation promise.

## Set up your own copy

Start with the [copyable ChatGPT setup prompt](docs/SETUP-PROMPT.md). Attach a downloaded copy of this repository, or provide its actual accessible link. You do not need to paste your API credentials into ChatGPT.

The intended host is ChatGPT Sites. You will need a Sites-enabled ChatGPT account, a Higgsfield API account, and API credentials entered in your own Site's private settings. See [deployment details](docs/DEPLOYMENT.md).

**Release status:** the starter is under validation. A fresh-owner Sites import, hosted authentication, and a paid end-to-end Higgsfield generation still need to be verified before this is described as a tested one-prompt setup. Follow the current validation record when one accompanies a release.

## Use the world

1. Sign in as the owner and create a world.
2. Open its display view full-screen on your computer. Connect that computer to the TV or monitor if needed.
3. Share the upload QR code or guest link with the people you want to invite.
4. On a phone, upload a drawing, choose its appearance, and submit it.
5. Keep the world open while it processes. New characters appear alongside the existing ones.

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

React and Vite provide the interface. A Cloudflare Worker-compatible server handles permissions and Higgsfield requests. D1 stores worlds and generation state; R2 stores artwork. The build emits `dist/server/index.js`, `dist/client`, and `dist/.openai/hosting.json`, following the Sites artifact layout found in an OpenAI starter. Hosted acceptance still needs verification.

Application bindings are `DB` for D1, `MEDIA` for R2, and `ASSETS` for static frontend files. This source can run in a compatible Worker environment, but production owner authentication is configured for the trusted identity supplied by Sites. Moving to another host requires a verified authentication adapter.

## Credits and license

The experience was inspired by [paper-aquarium](https://github.com/MrMoT9I/paper-aquarium). This starter does not include that project's code, fish models, or artwork. Its application code is available under the [MIT license](LICENSE). Higgsfield branding and API services, dependencies, and generated outputs remain subject to their respective terms.
