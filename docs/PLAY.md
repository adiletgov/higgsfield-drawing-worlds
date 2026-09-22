# Draw the room

An adult party game: draw someone in the room, let everyone guess, then reveal the name.

This is the party-mode pilot guide. See the [validation record](VALIDATION.md) for tested coverage. Party mode is the new default; earlier saved worlds remain available.

## Before guests arrive

The host needs a Sites-enabled ChatGPT account and their own Higgsfield API account. Use the [setup prompt](SETUP-PROMPT.md) and [setup guide](DEPLOYMENT.md) to prepare your own app. Enter API credentials only in private Site settings. Guest artwork uses the host's API account.

Create a party and open its display on a laptop, monitor, or laptop-connected TV. Keep the host controls on your own screen. Share the invitation QR code or link with your guests.

## Guests: make a drawing

Your prompt is **“Draw someone at this party.”**

1. Draw the person on paper. Keep it playful. Do not write their name on the drawing.
2. Open the invitation link or scan the QR code. No guest account is needed.
3. Photograph the paper drawing and upload it. Do not upload a photo of the person.
4. Enter their first name or nickname in the private answer field. After selecting a photo, choose **Keep my drawing**, **Polish it up**, or **3D cartoon loop**, then submit.

The answer stays hidden from the shared display until the host reveals it. Higgsfield API prepares portrait artwork from the drawing; it does not identify the person. The answer comes from the guest.

**3D cartoon loop** first creates a colorful, dimensional cartoon character, then animates it into a five-second video. It plays muted on repeat on the party screen. This takes longer and uses both image and video generation on the host's API account. Choosing the option alone does not start a generation; submitting does. It is a rendered video, not a model you can rotate.

Processing time varies. Upload early and allow time for the artwork to prepare. The screen's pause control also pauses video. If automatic playback is unavailable, use **Play animation**. Reduced-motion preferences keep it paused until you choose to play.

## Host: run the game

The first ready drawing appears automatically. Later drawings wait in the queue.

Let the group guess aloud. When everyone has had a turn, press **Reveal name**. Then press **Next drawing** to continue. There is no scoreboard or voting.

Use **Pause uploads**, replace the invitation link, or remove a drawing when needed. Keep invitations within your party and moderate the drawings before continuing.
