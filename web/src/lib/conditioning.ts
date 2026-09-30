// What each step of the sieve is conditional on, for the fine print. Keep in
// step with model.ts: when a step starts depending on something new, move it
// from `not` to `on` here.

export interface Conditioning {
  step: string;
  source: string;
  on: string; // what the rate depends on
  not: string; // what it's assumed independent of
  local: string; // how it varies by place
}

export const CONDITIONING: Conditioning[] = [
  {
    step: "Sex, age, marital status",
    source: "ACS tables",
    on: "counted directly",
    not: "—",
    local: "counted for each place",
  },
  {
    step: "Living with a partner, education, kids at home, living with parents, income bracket",
    source: "ACS microdata",
    on: "sex, age, marital status, and each other (measured jointly)",
    not: "—",
    local: "measured for each place, leaning on its region when samples are small",
  },
  {
    step: "Income floor inside a bracket",
    source: "ACS microdata",
    on: "sex, age, education, the bracket",
    not: "race, place",
    local: "national (the brackets themselves are local)",
  },
  {
    step: "Race/ethnicity",
    source: "ACS microdata",
    on: "sex, age, marital status, education, income",
    not: "kids at home, living situation",
    local: "each place's own mix; how it varies with education and income is national",
  },
  {
    step: "Height",
    source: "NHANES (measured)",
    on: "sex, age, race/ethnicity",
    not: "education, everything else",
    local: "national (varies by place only through race)",
  },
  {
    step: "Smoking",
    source: "NHANES, BRFSS",
    on: "sex, age, degree (bachelor's or not), race/ethnicity",
    not: "income, religion, politics, kids",
    local: "through its degree and race mix, plus its (or its state's) adult smoking rate beyond what that mix explains",
  },
  {
    step: "Religion",
    source: "CES 2024, Pew",
    on: "sex, age, education, race/ethnicity (and jointly with party)",
    not: "kids, income, health",
    local: "through its education and race mix, plus its religious mix beyond that (Pew metro or state, and CES respondents there, singles most)",
  },
  {
    step: "Politics",
    source: "CES 2024, 2024 results",
    on: "sex, age, education, race/ethnicity, religion",
    not: "kids, income, health",
    local: "through its education, race and religion mix, plus its 2024 vote beyond that",
  },
  {
    step: "Kids someday",
    source: "NSFG",
    on: "sex, age, education, kids already, race/ethnicity",
    not: "religion, income",
    local: "national (varies by place only through education, kids and race)",
  },
  {
    step: "BMI",
    source: "NHANES (measured), BRFSS",
    on: "sex, age, degree (bachelor's or not), race/ethnicity",
    not: "income, kids, everything else",
    local: "through its degree and race mix, plus its (or its state's) adult overweight and obesity rates beyond what that mix explains",
  },
  {
    step: "Orientation",
    source: "Gallup, NSFG",
    on: "sex, age",
    not: "everything else",
    local: "national",
  },
  {
    step: "Not seeing anyone",
    source: "GSS, HCMST, NSFG",
    on: "sex, age",
    not: "marriage history, kids, everything else",
    local: "national",
  },
  {
    step: "Actually looking (optional)",
    source: "Pew",
    on: "sex, age",
    not: "everything else",
    local: "national",
  },
];
