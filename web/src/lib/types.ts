// Person "type" used by the competition model: education (none, BA,
// graduate) x income bracket (<25k, 25-60k, 60-120k, 120k+) x kids at home
// x previously married.
export const NTYPE = 48;

export const typeIndex = (edu: number, inc: number, kids: number, prev: number) =>
  ((edu * 4 + inc) * 2 + kids) * 2 + prev;

export const typeOf = (t: number) => ({
  edu: Math.floor(t / 16),
  inc: Math.floor((t % 16) / 4),
  kids: Math.floor((t % 4) / 2),
  prev: t % 2,
});

// Available people by single year of age and type, from lo to hi.
export interface Typed {
  lo: number;
  hi: number;
  m: Float64Array; // (age - lo) * NTYPE + type
  race: Float64Array; // (age - lo) * NRACE + race, same people as m
  rel: Float64Array; // (age - lo) * NREL + religion, same people as m
  pol: Float64Array; // (age - lo) * NPOL + party, same people as m
}

// Political leaning (party identification, leaners with their party).
export const NPOL = 3;
// Independent/other: pure independents, third parties and no preference.
export const PARTIES = ["Democratic", "Independent/other", "Republican"];
export const PARTY_PLURAL = ["Democrats", "Independents & others", "Republicans"];

// Want (more) kids someday: 0 yes, 1 unsure, 2 no (NSFG RWANT).
export const WANT_KIDS = ["Wants kids", "Unsure", "Doesn't want kids"];
export const NWANT = 3;

// Religion: 0 Protestant (incl. nondenominational Christian), 1 Catholic,
// 2 Latter-day Saint, 3 Jewish, 4 other religion, 5 none.
export const NREL = 6;
export const RELIGIONS = ["Protestant", "Catholic", "Latter-day Saint", "Jewish", "Other religion", "Not religious"];

// Race/ethnicity: 0 White, 1 Black, 2 Hispanic (any race), 3 Asian,
// 4 other or multiracial (non-Hispanic unless noted).
export const NRACE = 5;
export const RACES = ["White", "Black", "Hispanic", "Asian", "Other/multiracial"];
