// Survey-based assumptions layered on top of Census counts. Each table is a
// piecewise-linear curve over age (anchor ages are band midpoints), so the
// step between, say, 29 and 30 is smooth rather than a cliff.

export type Sex = 1 | 2; // ACS coding: 1 male, 2 female

type Curve = [age: number, value: number][];

function interp(curve: Curve, age: number): number {
  if (age <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [a1, v1] = curve[i];
    if (age <= a1) {
      const [a0, v0] = curve[i - 1];
      return v0 + ((v1 - v0) * (age - a0)) / (a1 - a0);
    }
  }
  return curve[curve.length - 1][1];
}

export interface Source {
  label: string;
  url: string;
}

// Share of people of sex `sex` attracted to people of sex `to`.
// Gallup 2025 identity by age, split by sex using Gallup's sex ratios and
// checked against Gallup 2024 generation-by-sex totals; NSFG 2011-13 for the
// age gradient. Bisexual people count toward both columns.
const ATTRACTION: Record<string, Curve> = {
  "2to1": [[21, 0.94], [27, 0.95], [32, 0.965], [37, 0.97], [45, 0.975], [57, 0.98], [72, 0.987]],
  "2to2": [[21, 0.33], [27, 0.26], [32, 0.16], [37, 0.11], [45, 0.075], [57, 0.035], [72, 0.02]],
  "1to2": [[21, 0.94], [27, 0.955], [32, 0.96], [37, 0.965], [45, 0.965], [57, 0.984], [72, 0.98]],
  "1to1": [[21, 0.12], [27, 0.095], [32, 0.075], [37, 0.06], [45, 0.053], [57, 0.022], [72, 0.021]],
};

export function attraction(sex: Sex, to: Sex, age: number): number {
  return interp(ATTRACTION[`${sex}to${to}`], age);
}

// Share of unpartnered adults (not married, not cohabiting) who are
// nonetheless in a committed relationship. Derived as
// 1 - (Pew 2019 "single" share) / (ACS 2020-24 unpartnered share) by age
// band, pooling sexes because men and women report committed relationships
// asymmetrically. Consistent with Stanford HCMST (26% in 2022, 37% in 2017).
const IN_RELATIONSHIP: Curve = [[24, 0.44], [40, 0.28], [57, 0.1], [72, 0.12]];

export function inRelationship(age: number): number {
  return interp(IN_RELATIONSHIP, age);
}

// Share of singles "currently looking for a relationship or dates".
// Pew 2022: under 50 57%, 50-64 36%, 65+ 16%; men 50% vs women 35% overall
// (43% overall), applied as a multiplicative sex factor.
const LOOKING: Curve = [[34, 0.57], [57, 0.36], [72, 0.16]];
const LOOKING_SEX: Record<Sex, number> = { 1: 50 / 43, 2: 35 / 43 };

export function looking(sex: Sex, age: number): number {
  return Math.min(0.95, interp(LOOKING, age) * LOOKING_SEX[sex]);
}

export const SOURCES = {
  acs: {
    label: "ACS 2020-2024 5-year, table B12002 (sex by marital status by age)",
    url: "https://data.census.gov/table/ACSDT5Y2024.B12002",
  },
  pop: {
    label: "ACS 2020-2024 5-year, tables B01003 and B01001",
    url: "https://data.census.gov/table/ACSDT5Y2024.B01001",
  },
  pums: {
    label: "ACS 2020-2024 5-year Public Use Microdata Sample",
    url: "https://www.census.gov/programs-surveys/acs/microdata.html",
  },
  gallup: {
    label: "Gallup, LGBTQ+ identification (2025 data, published Feb 2026)",
    url: "https://news.gallup.com/poll/702206/lgbtq-identification-holds.aspx",
  },
  nsfg: {
    label: "CDC NSFG 2011-13, sexual attraction by age (NHSR 88)",
    url: "https://www.cdc.gov/nchs/data/nhsr/nhsr088.pdf",
  },
  pewSingles: {
    label: "Pew Research Center, A profile of single Americans (2020)",
    url: "https://www.pewresearch.org/social-trends/2020/08/20/a-profile-of-single-americans/",
  },
  pewLooking: {
    label: "Pew Research Center, 5 facts about single Americans (2023)",
    url: "https://www.pewresearch.org/short-reads/2023/02/08/for-valentines-day-5-facts-about-single-americans/",
  },
  hcmst: {
    label: "Rosenfeld (2025), the pandemic dating recession, HCMST 2017-2022",
    url: "https://web.stanford.edu/~mrosenfe/Rosenfeld_Pandemic_dating_recession_2025.pdf",
  },
  backus: {
    label: "Backus (2010), Why I don't have a girlfriend",
    url: "https://www.astro.sunysb.edu/fwalter/AST248/why_i_dont_have_a_girlfriend.pdf",
  },
} satisfies Record<string, Source>;
