// Shared between /api/rank and the Elsewhere section.

// raw: people through your sieve; adjusted: that pool adjusted for
// competition; odds: the adjustment itself (adjusted / raw).
// crowd: fewest competitors in the running per person (the market alone).
export type Sort = "raw" | "adjusted" | "crowd" | "odds";

// One row per market:
// [id, name, pool, adjusted, multiplier, map shape id, population,
//  competitors per person, preset tags]
export type RankRow = [string, string, number, number, number, string, number, number, string[]];

export interface RankResponse {
  all: RankRow[];
}

// Every market takes a few milliseconds, so the client asks for the country
// in PARTS parallel slices (same order every time) and merges them.
export const PARTS = 8;
