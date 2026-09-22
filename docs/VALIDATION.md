# Validation record

Status on September 22, 2026: **party mode is live and the two-portrait browser flow passed**. Creator pilot coverage remains incomplete.

## Party mode: live checks

- The existing reference app was updated to party mode. The original aquarium room remains available.
- Two real Higgsfield portraits completed: Alex (handmade, 45.040 seconds) and Sam (polished, 30.885 seconds). Timings are observed application job creation-to-completion times, not a future processing-time guarantee. Inputs were original digital illustrations of fictitious people, not photos of drawings on paper.
- The first portrait appeared anonymously; the second joined its queue. The host revealed Alex using the keyboard, the separate shared screen showed the answer, and Next drawing advanced to the anonymous second portrait. Refresh preserved round two and its hidden answer.
- Sam was submitted through the guest invitation without a ChatGPT session. Guest snapshot reads returned `200`, while owner room-list and reveal requests returned `403`. Before reveal, both character names were `Mystery guest`; the processing-job response also concealed its answer.
- Guest completion text did not echo the secret answer. Only the host view offered reveal and next controls.
- These two additional successful generations have an estimated cost of $0.08. Across the original world and party tests there were six upload attempts: two earlier failures before provider generation and four successful outputs, estimated at $0.16 total. The actual billing ledger has not been checked.

## Party mode: local checks

- Two demo portraits joined the queue. The host revealed the first answer, then advanced to the next drawing.
- Refreshing the second round and restarting the local server preserved it and kept its answer hidden until reveal.
- A 390px browser preview had no horizontal overflow. This was not a physical-phone test.
- 107 Vitest tests and 9 client checks passed, along with typecheck and formatting. The strict UI audit reported zero findings.

These local checks used demo output. The real-generation evidence is recorded separately above.

## Earlier world mode: verified history

- The [public GitHub repository](https://github.com/adiletgov/higgsfield-drawing-worlds) exists with template creation enabled.
- Sites accepted and deployed the app. Owner sign-in, world creation, and world persistence after redeployment worked.
- On the public deployment, signed-out requests and requests with a spoofed email header received `403` from the owner world-list endpoint. A guest invitation without a ChatGPT session read its world successfully (`200`) but could neither list owner worlds nor edit the world (`403`).
- Two real Higgsfield outputs, handmade Captain Bubbles and polished Little Comet, were visually checked. The second was submitted using a guest invitation without a ChatGPT session. Both automatically appeared together and survived display refresh and invitation replacement.
- Paused guest submissions received `403`. Repeating a completed submission with its original request ID returned the same job (`200`) without another generation. The old invitation received `403` after replacement.
- Switching the live world through aquarium, dinosaur valley, and outer space retained both generated characters and updated the separate display automatically.
- In local demo mode, a second character automatically joined the first. Switching through all three themes retained both characters; refreshing preserved the world. Demo output does not verify Higgsfield generation.
- A browser preview at 390px had equal client and scroll widths of 390px, with no horizontal overflow. This was an iframe preview, not a physical phone test.
- 92 Vitest tests and 4 client-logic checks passed. The production dependency audit reported zero known vulnerabilities at the time checked.

## Earlier world mode: live generation

| Test            | Appearance | Job creation to completion |
| --------------- | ---------- | -------------------------- |
| Captain Bubbles | Handmade   | 39.768 seconds             |
| Little Comet    | Polished   | 43.956 seconds             |

These are two observed application job timings, not an instant-generation or future processing-time guarantee. Inputs were original digital illustrations, not photos of drawings on paper.

There were four upload attempts: two failed at the initial nonbillable upload-URL request before a generation request ID was obtained, followed by two successful generations after the runtime request-option fix. The estimated cost of the two generations is $0.08; the actual billing ledger has not been checked.

## Remaining pilot checks

A separate fresh owner's one-prompt setup, an actual photo of a paper drawing, and physical phone/TV use remain unverified. Do not describe the creator setup as proven until those checks pass. The broader [release acceptance checklist](DEPLOYMENT.md#acceptance-checks-for-a-release) also applies.
