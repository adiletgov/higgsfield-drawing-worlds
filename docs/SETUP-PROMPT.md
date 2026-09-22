# Set up your own Drawing Worlds app

Attach a source ZIP of this repository to a ChatGPT task with Sites available, or provide the actual accessible repository link. Copy the prompt below. Do not include API keys or secrets in the message or attachment.

The reference prototype has completed two real Higgsfield generations. A separate owner's full setup, photos of paper drawings, and physical phone/TV use still need a pilot test. This prompt asks ChatGPT to verify setup and your own app; it does not promise a proven one-prompt installation. See the [validation record](VALIDATION.md).

---

Set up my own separate **Higgsfield Drawing Worlds** website from https://github.com/adiletgov/higgsfield-drawing-worlds and host it with ChatGPT Sites. If I attached my personalized copy, use that instead. Use this application's existing implementation. I want an aquarium, dinosaur park, and space world; handmade or polished characters; phone uploads; and a persistent display where new drawings join earlier characters. I do not want to edit code myself.

Read the README and deployment guide first. Check the current Sites runtime and build contract, make the minimum compatibility changes, and run the project's checks. Prepare a new personal Site with its own database and media storage. Never reuse another owner's project ID, credentials, worlds, or guest links. Use D1 binding `DB`, R2 binding `MEDIA`, and static asset binding `ASSETS`.

Use my ChatGPT sign-in for owner controls. Ask me for the email address I will sign in with, then configure `OWNER_EMAIL` accordingly. Keep every owner action protected on the server. Guests should need only a scoped, revocable upload link for one world. The display shows that world's invitation QR so people watching can upload; it must never grant owner controls. Do not add generation-count or spending quotas. Guest generation uses my own Higgsfield API account.

Show me exactly where to enter `HIGGSFIELD_API_KEY` and `HIGGSFIELD_API_SECRET` in my Site's private environment settings. Never ask me to paste those values into this conversation. Never put them in source code, the browser, URLs, or logs. Disable local-owner bypass and demo mode for the hosted app. Tell me when the settings are ready and continue after I have entered the values.

Check the preview and owner/guest/display permissions before sharing the app. After the credentials are configured, deploy the saved version. Make the site reachable for people using my guest and display links, while keeping owner controls restricted to my account. Give me a clear confirmation before a real test that will use paid Higgsfield API generation, including the planned number of generations and the current estimated cost.

With the test authorized, verify two different drawings from a phone, both appearance choices, and all three world themes. Check that characters remain after refresh, a failed job preserves existing characters, and a guest cannot reach owner controls or credentials. Give me the owner URL and a short guide to opening the display on my laptop or TV and inviting uploads.

If you cannot access the repository, current Sites tooling, credentials, or a required capability, explain the exact missing step. Do not substitute a different app, present demo artwork as a real API result, or claim that setup or deployment succeeded before verifying it.
