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
// nonetheless in a relationship with someone they don't live with, by sex and
// age (anchors at band midpoints). Weighted microdata estimates bracket it:
// the strict GSS 2012-24 "steady partner" item (~15%) is a floor, the broad
// "boyfriend/girlfriend/romantic partner" items in HCMST 2017 and GSS 1996/98
// (32-38%) a ceiling, with NSFG 2022-23 current partners in between. Values
// sit mid-range, leaning on recent sources; every source shows unpartnered
// women under 50 reporting more such relationships than men, and the reverse
// after 55.
const IN_RELATIONSHIP: Record<Sex, Curve> = {
  1: [[21, 0.22], [27, 0.24], [32, 0.25], [37, 0.24], [42, 0.24], [47, 0.26], [52, 0.26], [60, 0.2], [72, 0.18]],
  2: [[21, 0.42], [27, 0.42], [32, 0.38], [37, 0.34], [42, 0.32], [47, 0.3], [52, 0.28], [60, 0.15], [72, 0.08]],
};

export function inRelationship(sex: Sex, age: number): number {
  return interp(IN_RELATIONSHIP[sex], age);
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
    label: "Stanford How Couples Meet and Stay Together 2017 (microdata)",
    url: "https://data.stanford.edu/hcmst2017",
  },
  gss: {
    label: "General Social Survey 1996-2024 (microdata: ROMANCE, POSSLQ)",
    url: "https://gss.norc.org/us/en/gss/get-the-data/stata.html",
  },
  nsfg2022: {
    label: "CDC National Survey of Family Growth 2022-2023 (microdata)",
    url: "https://www.cdc.gov/nchs/nsfg/nsfg-2022-2023-puf.htm",
  },
  choo: {
    label: "Choo & Siow (2006), Who marries whom and why",
    url: "https://doi.org/10.1086/498585",
  },
  mcfadden: {
    label: "McFadden (1978), sampling alternatives in conditional logit",
    url: "https://onlinepubs.trb.org/Onlinepubs/trr/1978/673/673-012.pdf",
  },
  schwartzMare: {
    label: "Schwartz & Mare (2005), Trends in educational assortative marriage",
    url: "https://doi.org/10.1353/dem.2005.0036",
  },
  bruch: {
    label: "Bruch & Newman (2018), Aspirational pursuit of mates in online dating markets",
    url: "https://doi.org/10.1126/sciadv.aap9815",
  },
  hitsch: {
    label: "Hitsch, Hortaçsu & Ariely (2010), What makes you click?",
    url: "https://doi.org/10.1007/s11129-010-9088-6",
  },
  stulp: {
    label: "Stulp et al. (2013), Human height is positively related to partner preferences",
    url: "https://doi.org/10.1371/journal.pone.0054186",
  },
  nhanes: {
    label: "CDC NHANES 2017-2023 (measured height and BMI, smoking)",
    url: "https://wwwn.cdc.gov/nchs/nhanes/continuousnhanes/default.aspx?Cycle=2021-2023",
  },
  brfss: {
    label: "CDC BRFSS 2024 metro (SMART) and state prevalence",
    url: "https://data.cdc.gov/Behavioral-Risk-Factors/Behavioral-Risk-Factors-Selected-Metropolitan-Area/j32a-sa6u",
  },
  pep: {
    label: "Census Vintage 2025 population estimates by metro and county, sex and age",
    url: "https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/",
  },
  nsfgWant: {
    label: "CDC National Survey of Family Growth 2022-2023",
    url: "https://www.cdc.gov/nchs/nsfg/nsfg-2022-2023-puf.htm",
  },
  ersTypology: {
    label: "USDA ERS County Typology Codes, 2025 edition",
    url: "https://www.ers.usda.gov/data-products/county-typology-codes",
  },
  mountains: {
    label: "Kapos et al. (2000), the UNEP-WCMC definition of mountain terrain",
    url: "https://doi.org/10.1079/9780851994468.0004",
  },
  terrainTiles: {
    label: "AWS Terrain Tiles (USGS 3DEP elevations)",
    url: "https://registry.opendata.aws/terrain-tiles/",
  },
  election: {
    label: "2024 presidential results by county (compiled from official returns)",
    url: "https://github.com/tonmcg/US_County_Level_Election_Results_08-24",
  },
  pewProvider: {
    label: "Pew (2017), Americans see men as the financial providers",
    url: "https://www.pewresearch.org/short-reads/2017/09/20/americans-see-men-as-the-financial-providers-even-as-womens-contributions-grow/",
  },
  hcmstPolitics: {
    label: "Stanford How Couples Meet and Stay Together 2017 (partners' party)",
    url: "https://data.stanford.edu/hcmst2017",
  },
  religionLocal: {
    label: "Local religious composition (see methodology)",
    url: "https://www.pewresearch.org/religious-landscape-study/",
  },
  diNallo: {
    label: "Di Nallo (2019), Gender gaps in repartnering: the role of parental status",
    url: "https://doi.org/10.1111/jomf.12527",
  },
  backus: {
    label: "Backus (2010), Why I don't have a girlfriend",
    url: "https://www.astro.sunysb.edu/fwalter/AST248/why_i_dont_have_a_girlfriend.pdf",
  },
} satisfies Record<string, Source>;

// ---------------------------------------------------------------- height
// Measured height, NHANES Aug 2021-Aug 2023 (BMX_L), weighted means and SDs
// by sex and age band (pipeline/context.py).
export function heightDist(sex: Sex, age: number): { mean: number; sd: number } {
  if (sex === 1) return age < 40 ? { mean: 69.36, sd: 2.95 } : age < 60 ? { mean: 69.03, sd: 3.02 } : { mean: 68.27, sd: 2.97 };
  return age < 40 ? { mean: 64.17, sd: 2.73 } : age < 60 ? { mean: 63.57, sd: 2.72 } : { mean: 62.67, sd: 2.68 };
}

function normCdf(z: number): number {
  // Abramowitz & Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

// Share of people of `sex` and `age` no taller ("le") or no shorter ("ge")
// than `h` inches, treating reported heights as rounded to the inch.
export function heightShare(sex: Sex, age: number, h: number, dir: "le" | "ge"): number {
  const { mean, sd } = heightDist(sex, age);
  return dir === "le" ? normCdf((h + 0.5 - mean) / sd) : 1 - normCdf((h - 0.5 - mean) / sd);
}

// Relative appeal (log scale) of a candidate's height to a chooser, from the
// first-contact probits in Hitsch, Hortacsu & Ariely (2010), cross-checked
// against Stulp et al. (2013). Women: each inch he is shorter than her costs
// about 40%; appeal rises ~6%/inch up to 8 inches taller, easing past 10.
// Men: a taller woman costs ~20%/inch, plus a mild penalty above 5'5.5".
export function heightLogAppeal(chooser: Sex, chooserH: number, candidateH: number): number {
  if (chooser === 2) {
    const d = candidateH - chooserH;
    return 0.06 * Math.min(Math.max(d, 0), 8) - 0.5 * Math.max(-d, 0) - 0.1 * Math.max(d - 10, 0);
  }
  return -0.23 * Math.max(candidateH - chooserH, 0) - 0.055 * Math.max(candidateH - 65.5, 0);
}

// ------------------------------------------------------------------ kids
// Relative appeal (log) of a candidate with kids at home versus one without,
// by the candidate's sex and whether the chooser has kids at home:
// KIDS_LOG[candidate sex][chooser has kids]. Di Nallo (2019) union-formation
// odds after a breakup by the new partner's parental status (mothers 0.57 with
// a childless partner vs 1.06 with a parent; fathers 0.85 vs 1.22), consistent
// with Hitsch et al.'s first-contact estimates (x0.68-0.74 from childless
// choosers, x1.2 from parents).
export const KIDS_LOG: Record<Sex, [number, number]> = {
  1: [Math.log(0.8), Math.log(1.2)],
  2: [Math.log(0.6), Math.log(1.1)],
};
