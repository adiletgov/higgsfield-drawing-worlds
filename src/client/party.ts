import type { Character, PartyState } from "../shared";
export function partyPresentation(
  party: PartyState | undefined,
  characters: Character[],
) {
  const active = characters.find(
    (character) => character.id === party?.activeCharacterId,
  );
  const revealed = Boolean(active && party?.revealed);
  return {
    active,
    answer: revealed ? active!.name : undefined,
    portraitLabel: revealed
      ? `Portrait of ${active!.name}`
      : "Mystery party portrait",
    queued: Math.max(0, (party?.total || 0) - (party?.round || 0)),
    canReveal: Boolean(active && !revealed),
    canNext: Boolean(active && revealed),
  };
}
