export type Sort = 'raw' | 'adjusted' | 'crowd' | 'odds';
export interface RankRow {
  id: string; name: string; pool: number; scenarioPool: number; adjusted: number | null; multiplier: number | null;
  shape: string; population: number; competitors: number | null; tags: string[];
  effectiveSupport: number; status: 'supported' | 'thin' | 'unavailable'; reason?: string;
}
export interface RankResponse { artifactVersion: number; buildId: string; totalMarkets:number; part: number; all: RankRow[] }
export const PARTS = 8;
export const ARTIFACT_VERSION = 2;
