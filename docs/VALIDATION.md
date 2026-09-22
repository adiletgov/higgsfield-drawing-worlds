# Validation record

Status on September 22, 2026: **under validation; live generation is unresolved**.

## Verified

- The [public GitHub repository](https://github.com/adiletgov/higgsfield-drawing-worlds) exists with template creation enabled.
- Sites accepted and deployed the app. Owner sign-in, world creation, and world persistence after redeployment worked.
- On the public deployment, signed-out requests and requests with a spoofed email header received `403` from the owner world-list endpoint. A guest invitation without a ChatGPT session read its world successfully (`200`) but could neither list owner worlds nor edit the world (`403`).
- In local demo mode, a second character automatically joined the first. Switching through all three themes retained both characters; refreshing preserved the world. Demo output does not verify Higgsfield generation.
- A browser preview at 390px had equal client and scroll widths of 390px, with no horizontal overflow. This was an iframe preview, not a physical phone test.
- 86 Vitest tests and 4 client-logic checks passed. The production dependency audit reported zero known vulnerabilities at the time checked.

## Live generation and remaining checks

Two live submission attempts failed before a generation request ID was obtained. The second reported a fetch connection error at the initial nonbillable upload-URL request. The cause is still being diagnosed; no real generated output or charge has been confirmed.

A successful real generation flow, a separate fresh owner's one-prompt setup, and physical phone/TV use remain unverified. Do not describe this release as ready or its setup as proven until those checks pass. The broader [release acceptance checklist](DEPLOYMENT.md#acceptance-checks-for-a-release) also applies.
