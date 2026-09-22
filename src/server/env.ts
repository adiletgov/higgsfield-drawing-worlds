import type { AuthEnv } from "./security";
export interface Env extends AuthEnv {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  HIGGSFIELD_API_KEY?: string;
  HIGGSFIELD_API_SECRET?: string;
}
