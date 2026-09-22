export type Theme = "aquarium" | "dinosaur" | "space" | "party";
export type Appearance = "handmade" | "polished" | "animated";
export type JobStatus =
  "queued" | "submitting" | "processing" | "completed" | "failed" | "uncertain";
export interface World {
  id: string;
  name: string;
  theme: Theme;
  uploadsOpen: boolean;
  createdAt: string;
  guestToken?: string;
  displayToken?: string;
}
export interface Character {
  id: string;
  name: string;
  appearance: Appearance;
  assetUrl: string;
  mediaType?: "image" | "video";
  posterUrl?: string;
  createdAt: string;
}
export interface Job {
  id: string;
  name: string;
  status: JobStatus;
  appearance?: Appearance;
  phase?: "illustrating" | "animating";
  message?: string;
  createdAt: string;
}
export interface Snapshot {
  world: World;
  characters: Character[];
  jobs: Job[];
  party?: PartyState;
}
export interface PartyState {
  activeCharacterId: string | null;
  revealed: boolean;
  round: number;
  total: number;
}
export interface Session {
  owner: boolean;
  configured: boolean;
  generationReady: boolean;
  demo: boolean;
  signInUrl: string;
}

// API responses are JSON; errors use { error: string }. Same-origin state-changing requests.
// GET /api/session -> Session
// GET /api/worlds -> {worlds: World[]} (owner)
// POST /api/worlds {name,theme} -> World (owner)
// PATCH /api/worlds/:id {name?,theme?,uploadsOpen?,rotateGuest?:true} -> World (owner)
// GET /api/worlds/:id -> Snapshot (owner or Authorization: Bearer display/guest token)
// PATCH /api/worlds/:id/party {action:'reveal'|'next',activeCharacterId:string} -> PartyState (owner)
// Party Character.name/Job.name stay "Mystery guest" until that drawing is revealed.
// POST /api/worlds/:id/jobs {name,appearance,image:PNG data URL,requestId:UUID} -> Job (owner/guest)
// GET /api/worlds/:id/jobs/:jobId -> Job (owner/guest/display)
// DELETE /api/worlds/:id/characters/:id -> {ok:true} (owner)
// GET /api/worlds/:id/assets/:characterId (owner/bearer token) -> image/png or video/mp4
// GET /api/worlds/:id/posters/:characterId (owner/bearer token) -> image/png for completed animations
// Asset URLs need authenticated fetch to blob in the client; never add tokens to query strings.
// UI routes: / (owner), /world/:id#displayToken, /join/:id#guestToken.
