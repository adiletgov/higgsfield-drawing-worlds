# Deployment and verification

## Supported target and current status

ChatGPT Sites is the intended managed host. The [official Sites guide](https://learn.chatgpt.com/docs/sites) documents compatible existing projects, D1 and R2 storage, Site settings for runtime secrets, and optional Sign in with ChatGPT. The reference deployment was accepted and published on September 22, 2026. Hosted sign-in, live generation and setup by a separate owner still need acceptance checks.

No repository owner or hosted project identifier belongs in this public starter. Create a fresh Site for each person. Preserve and reuse that person's returned project ID for later updates.

## Runtime settings

| Name                    | Purpose                                                                | Production value                              |
| ----------------------- | ---------------------------------------------------------------------- | --------------------------------------------- |
| `OWNER_EMAIL`           | Owner identity accepted from the trusted Sites authentication boundary | The owner's actual ChatGPT sign-in email      |
| `HIGGSFIELD_API_KEY`    | Higgsfield public API key                                              | Secret, entered through private Site settings |
| `HIGGSFIELD_API_SECRET` | Higgsfield public API secret                                           | Secret, entered through private Site settings |
| `ALLOW_LOCAL_OWNER`     | Development-only owner bypass                                          | Omit or set `false`                           |
| `DEMO_MODE`             | Development-only simulated artwork                                     | Omit or set `false`                           |

Enter secrets at **Sites → your Site → Settings**, using the environment/secrets controls currently available. Keep values out of chats, attachments, screenshots, source, and `.openai/hosting.json`. After changing runtime settings, redeploy the selected saved version. Local development uses an ignored `.dev.vars` file; `.env.example` contains only examples.

Use these bindings:

| Binding  | Type                 | Stores                                             |
| -------- | -------------------- | -------------------------------------------------- |
| `DB`     | D1                   | Worlds, characters, job state, access capabilities |
| `MEDIA`  | R2                   | Uploaded and generated artwork                     |
| `ASSETS` | Static asset Fetcher | Built frontend files                               |

The verified storage portion of a fresh Sites manifest is:

```json
{
  "d1": "DB",
  "r2": "MEDIA"
}
```

Provisioning adds the real `project_id`. Do not put placeholder deployment identifiers into a release or copy another owner's ID.

## Build artifacts

The build follows the Sites handoff pattern found in a cached OpenAI Product Design starter:

```text
dist/
  .openai/hosting.json
  server/index.js
  client/index.html
  client/assets/...
```

Its Worker serves static files through `env.ASSETS.fetch(request)`. This artifact layout has been accepted by Sites for the reference deployment. Keep the existing app; do not replace it with a new generated starter.

Run `npm run package:site` to build `drawing-worlds-site.tar.gz`. The archive includes `.openai/hosting.json` at its root and retains the `dist/server/index.js` and `dist/client` paths. Do not tar just the contents of `dist`: that loses the entrypoint path Sites expects.

Current Sites tool contracts require a deployment tar containing build output and its manifest, associated with the exact source commit already pushed to the Site's configured source repository. The archive is not a source-code ZIP. Omitting an archive requests the platform's remote-build fallback. Follow the available workflow's source, save-version, and deployment steps; every deployment URL is a production URL.

The server initializes its additive schema on the first database request. Verify that worlds and characters survive a redeployment; never reset an existing owner's data to fix setup. Future schema changes should use versioned additive migrations.

## Authentication and sharing

Sites can provide `/signin-with-chatgpt` and `/signout-with-chatgpt`, and forward authenticated identity to server handlers. Restrict administrative actions to the configured owner. Authenticate and authorize every request independently of which controls the interface displays.

Do not trust an arbitrary client-supplied `oai-authenticated-user-email` header on a generic host. This identity contract is valid only behind the trusted Sites authentication boundary. A different production host needs a real authentication adapter and must prevent access around its authentication proxy.

Keep a new Site private during setup. To permit guests without a ChatGPT account, the platform audience must eventually allow public visits; application routes must still enforce the scoped upload/display capabilities. A public platform audience must not turn owner APIs or stored artwork into public resources. Owner access and guest/display access are separate permissions.

Guest and display tokens are link capabilities. Keep them in URL fragments on the client and send them only through authorized same-origin requests. Do not add tokens to asset query strings, analytics, server logs, or third-party links. The display intentionally shows the current guest invitation QR, so viewers can upload through it. Rotating a guest link invalidates the old upload link; an existing display still shows the current invitation. Pause uploads to stop all guest submissions. Guests' requests use the owner's API credentials; no application generation-count or spending quota is imposed.

## Acceptance checks for a release

1. Start with a clean source copy and a different owner's account. Complete setup without editing application code by hand.
2. Confirm real owner sign-in and denial of all owner mutations to guests and signed-out visitors.
3. Create a world, open the display on another device, and scan its guest QR code from a phone.
4. With a bounded paid test authorized, generate from two different drawings. Check handmade and polished output and all three themes.
5. Refresh and reopen the world; confirm persistence. Submit concurrent/retried requests and confirm they do not duplicate a paid job.
6. Confirm pause uploads, guest-link replacement, character removal, and failure handling preserve the intended world.
7. Inspect browser responses and built assets for accidental secrets. Confirm local bypass and simulated output are disabled on the hosted origin.
8. Record actual setup effort, generation time, charged cost, device coverage, and any remaining limitations. Only then describe the setup as tested.

Opening the app on a computer connected to a TV is the initial display path. Native TV browsers, AirPlay, and Chromecast need separate verification before being advertised.
