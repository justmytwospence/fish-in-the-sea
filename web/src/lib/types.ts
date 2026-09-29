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
}
