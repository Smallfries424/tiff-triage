import fs from "node:fs";
import path from "node:path";

export type Synopsis = {
  synopsis?: string | null;
  teaser?: string | null;
  url?: string;
  noNotePublished?: boolean;
};

/**
 * TIFF's programmer's notes, if this checkout has them.
 *
 * They are gitignored, being TIFF's editorial writing rather than this project's
 * data, so a fresh clone does not have the file, and `import synopses from
 * "@/data/synopses.json"` would fail the build outright. The README has always
 * said film pages fall back to the short rationale without it; this is what makes
 * that true rather than aspirational.
 *
 * Read from disk rather than imported so the absence is a runtime empty object
 * instead of a missing module. Every page that uses this is prerendered, so the
 * read happens once at build time and the file is never needed at runtime.
 */
const load = (): Record<string, Synopsis> => {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/synopses.json"), "utf8"));
  } catch {
    return {};
  }
};

export const SYNOPSES = load();
