import type { CSSProperties } from "react";
import type { Snapshot, Theme } from "../shared";
import { CharacterImage } from "./CharacterMedia";
export { CharacterImage } from "./CharacterMedia";
import { themes } from "./ui";

export function WorldStage({
  snapshot,
  theme = "aquarium",
  token,
  preview = false,
  full = false,
  paused = false,
}: {
  snapshot?: Snapshot;
  theme?: Theme;
  token?: string;
  preview?: boolean;
  full?: boolean;
  paused?: boolean;
}) {
  const current = snapshot?.world.theme || theme;
  const characters = snapshot?.characters || [];
  return (
    <div
      className={`world-stage theme-${current} ${full ? "stage-full" : ""} ${paused ? "motion-paused" : ""}`}
      aria-label={`${themes[current].name} living world`}
    >
      <img className="world-background" src={`/${current}.svg`} alt="" />
      <div className="atmosphere" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => (
          <i
            key={i}
            style={{
              left: `${12 + i * 13}%`,
              animationDelay: `-${i * 3}s`,
              animationDuration: `${17 + i * 2}s`,
            }}
          />
        ))}
      </div>
      {!characters.length && (
        <div className="stage-empty">
          <div className="sample-orbit">
            <img
              className="sample-drawing"
              src={`/sample-${themes[current].sample}.svg`}
              alt="An illustrative sample character"
            />
          </div>
          <div className="stage-empty-message">
            <span className="eyebrow">
              {preview ? "A little preview" : "Your world starts here"}
            </span>
            <strong>
              {preview
                ? "Just add imagination."
                : "Make the first little resident."}
            </strong>
            <p>
              {preview
                ? "Every drawing deserves a world of its own."
                : "Scan the code. Add a drawing. Watch it come alive."}
            </p>
          </div>
          <span className="sample-caption">Illustrative sample</span>
        </div>
      )}
      <div className="character-layer">
        {characters.map((character, index) => {
          const seed = Array.from(character.id).reduce(
            (n, c) => n + c.charCodeAt(0),
            0,
          );
          const style = {
            "--x": `${8 + ((seed * 13) % 73)}%`,
            "--y": `${18 + ((seed * 7) % 45)}%`,
            "--duration": `${20 + (seed % 23)}s`,
            "--delay": `-${seed % 30}s`,
            "--drift": `${(seed % 2 ? 1 : -1) * (35 + (seed % 90))}px`,
            "--size": `${120 + (seed % 50)}px`,
            "--tilt": `${seed % 2 ? 5 : -5}deg`,
          } as CSSProperties;
          return (
            <div className="world-character" key={character.id} style={style}>
              <div className="character-bob">
                <CharacterImage
                  character={character}
                  worldId={snapshot!.world.id}
                  token={token}
                />
                <span className="character-name">{character.name}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="stage-signature" aria-hidden="true">
        A world made by you.
      </div>
    </div>
  );
}
