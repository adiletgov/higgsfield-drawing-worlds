# Validation record

Status on September 22, 2026: **party mode and the optional 3D cartoon loop are live**. Creator pilot coverage remains incomplete.

## 3D cartoon loop: live check

- One real animated Alex portrait completed through both Higgsfield stages in **218.249 seconds (about 3 minutes 38 seconds)**. This is an observed application job creation-to-completion time, not a processing-time guarantee. The input was an original digital drawing of a fictitious person.
- The finished colorful, dimensional cartoon appeared automatically on the separate party screen. The stored MP4 measured 960 × 960 pixels and 5.042 seconds in the browser. It played muted on repeat, with visible facial movement.
- Refreshing the guest page during processing resumed the existing animation job. The completion message did not reveal the supplied answer.
- Local pause and play worked. Global pause stopped the video and disabled its local play button. Host reveal changed the heading and accessible media label to Alex while preserving the same media source and exact paused position; resuming worked.
- Refreshing the party display restored round one, the revealed answer, and the playing cartoon. The resulting character and blink were visually checked after refresh.
- Before reveal, a guest request without a ChatGPT session returned `200`, with `Mystery guest` in the snapshot and completed-job response. The MP4 and PNG poster returned `200` with that invitation; both returned `403` without authorization.
- This check used one image-generation request and one video-generation request. Estimated cost was $0.145 at the model's displayed discount, or $0.25 at its displayed undiscounted rate. These are dated estimates for this test, not a pricing guarantee; the billing ledger was not checked.

## 3D cartoon loop: source and interface checks

- The third finish appears after selecting a photo in party mode. Selecting it alone does not start generation. The form explains that it creates an image and a video, takes longer, and adds video generation to the host's API cost.
- The live pipeline persists the illustration and animation stages independently, stores the poster and MP4, and publishes the portrait only when the video is ready. Ambiguous paid submissions are not automatically repeated.
- 137 Vitest tests passed before independent review. Two review findings were then fixed: strict appearance input validation and terminal handling of malformed provider image data. The 39 affected tests passed after those fixes. Typecheck, formatting, the production build, 14 client checks, and a strict UI audit with zero findings passed on the final application source.
- Coverage includes stage recovery, duplicate submission protection, failed or uncertain provider responses, authenticated video and poster access, unrevealed answers, stale polling, and video playback lifecycle. Independent review found no remaining material findings after the fixes.
- A 390px browser preview showed all finish controls and the submit action without horizontal overflow. Demo mode clearly disables video generation. This was not a physical-phone test.

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
