# Fish in the Sea

How many people could you actually date? Pick a US town, your age and sex, and who you're looking for; the site sifts the population one step at a time using Census data and a few survey-based rates, adjusts for competition, and compares every metro, micro area and rural county.

## Layout

- `pipeline/` builds static data (no API keys needed).
- `web/` is the Next.js site. It reads `web/public/data/` and deploys to Vercel.

## Data sources

- ACS 2020-2024 5-year summary tables B01003, B01001, B12002 (counts by sex, age and marital status for every metro and micro area, and every county outside one), scaled to the Census Vintage 2025 population estimates (metros by single year of age, counties by five-year group). B14001 (college enrollment) defines college towns.
- ACS 2020-2024 5-year PUMS: cohabitation, education, own children, living with parents, personal income, single-year age shares, and recently formed couples for the competition model.
- 2020 tract-to-PUMA relationship file and July 2023 CBSA delineations (to weight PUMAs into metros); 2026 Gazetteer place coordinates (search and geolocation).
- Preset sets in the Elsewhere section: USDA ERS County Typology Codes, 2025 edition (recreation-dependent, retirement destination), and mountain terrain per Kapos et al. (2000) computed in `pipeline/terrain.py` from AWS Terrain Tiles (fetched and cached in `raw/tiles` on first run).
- NHANES 2017-2023: measured height, measured BMI and smoking, modeled by sex, age, degree, race/ethnicity and partner status.
- CDC BRFSS 2024 metro (SMART) and state prevalence for smoking and obesity, via data.cdc.gov (datasets j32a-sa6u and dttw-5yxu), applied net of each place's make-up.
- Cooperative Election Study 2024 common content (`raw/ces2024.csv`, open download from https://doi.org/10.7910/DVN/X11EP6): religion and party identification, jointly, by sex, age, education, race/ethnicity and marital status, plus local religion evidence by county.
- General Social Survey 1972-2024 cumulative file (gss7224_r3a.dta from gss.norc.org): religious pairing of married couples (competition model), and the fallback religion and party rates.
- Pew Research Center Religious Landscape Study 2023-24: national religion level (calibration) and composition for every state and 34 metros, scraped from the public state and metro pages into `pipeline/raw/pew_rls_2023_24.csv`.
- CDC National Survey of Family Growth 2022-2023 respondent files (NSFG_2022_2023_{Fem,Male}RespPUFData.csv from ftp.cdc.gov/pub/Health_Statistics/NCHS/NSFG): whether unpartnered adults want kids someday, by sex, age, education, parity and race/ethnicity.
- 2024 presidential results by county (github.com/tonmcg/US_County_Level_Election_Results_08-24).
- Survey and literature assumptions (Gallup, NSFG, GSS, HCMST, Pew, Di Nallo on kids, Hitsch et al. on height) live in `web/src/lib/assumptions.ts` with citations.

## Rebuilding the data

```sh
cd pipeline/raw
UA="Mozilla/5.0"
B=https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF
for t in b01001 b01003 b12002 b14001; do curl -O $B/data/5YRData/acsdt5y2024-$t.dat; done
curl -O $B/documentation/Geos20245YR.txt
curl -O https://www2.census.gov/geo/docs/maps-data/data/rel2020/2020_Census_Tract_to_2020_PUMA.txt
curl -O https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx
curl -O https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/metro/asrh/cbsa-est2025-syasex.csv
curl -O https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/counties/asrh/cc-est2025-agesex-all.csv
curl -A "$UA" -L -o ers-typology-2025.csv "https://www.ers.usda.gov/media/6174/ers-county-typology-codes-2025-edition.csv"
curl -O https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_place_national.zip && unzip 2026_Gaz_place_national.zip
for f in 2021/DataFiles/DEMO_L 2021/DataFiles/BMX_L 2021/DataFiles/SMQ_L 2017/DataFiles/P_DEMO 2017/DataFiles/P_BMX 2017/DataFiles/P_SMQ; do
  curl -A "$UA" -O https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/$f.xpt; done
curl -L -o pres2024_county.csv https://raw.githubusercontent.com/tonmcg/US_County_Level_Election_Results_08-24/master/2024_US_County_Level_Presidential_Results.csv
curl -O https://www2.census.gov/programs-surveys/acs/data/pums/2024/5-Year/csv_pus.zip && unzip csv_pus.zip
duckdb -c "copy (select SERIALNO, SPORDER::INT sporder, STATE::INT st, PUMA::INT puma, PWGTP::INT w, AGEP::INT age, SEX::INT sex, MAR::INT mar, MARHT::INT marht, MARHYP::INT marhyp, RELSHIPP::INT rel, SCHL::INT schl, PAOC::INT paoc, PINCP::INT pincp, ADJINC::BIGINT adjinc, ESR::INT esr, RAC1P::INT rac1p, HISP::INT hisp from read_csv('psam_pus*.csv', union_by_name=true, types={'SERIALNO':'VARCHAR'})) to 'pums.parquet' (format parquet, compression zstd)"
for s in Fem Male; do curl -A "$UA" -O https://ftp.cdc.gov/pub/Health_Statistics/NCHS/NSFG/NSFG-2022-2023-${s}RespPUFData.zip && unzip -o NSFG-2022-2023-${s}RespPUFData.zip; done

cd .. && uv run python build.py && uv run python choice.py && uv run python context.py && uv run python religion.py && uv run python politics.py && uv run python beliefs.py && uv run python kids.py
```

- `build.py` writes per-market counts (ACS scaled to the 2025 estimates), attribute mixes, the national race-by-education-and-income tilt, within-bracket income shares by education, preset tags and the place search index, plus `market_comp.parquet` (each market's adults by sex, age, education, race and partner status) for the local shifts below.
- `choice.py` fits the revealed-preference model behind the competition section (a conditional logit on recently formed couples versus sampled single alternatives, about a minute).
- `politics.py` writes national party identification rates (GSS), political pairing (HCMST 2017, `raw/hcmst2017.dta` from data.stanford.edu/hcmst2017) and per-metro shifts from the 2024 vote.
- `religion.py` writes national religion rates, religious pairing and per-metro local shifts.
- `beliefs.py` fits religion and party jointly on the CES and writes national rates for the unmarried by sex, age, education and race, plus per-market shifts net of composition (Pew, local CES respondents, 2024 vote).
- `kids.py` writes rates of wanting kids someday by sex, age, education, parity and race (NSFG).
- `context.py` fits the NHANES health models (smoking and BMI by degree and race; height by race), writes per-market context and health shifts net of composition, and pulls BRFSS from data.cdc.gov.
- `audit_conditioning.py` measures how much each survey rate varies with the other filters (how the conditioning work was prioritized).

The site is a static snapshot of the data above. To refresh it for a later ACS release, change `YEAR` in `pipeline/build.py`, update the URLs above, rebuild and redeploy.

## Running the site

```sh
cd web && npm install && npm run dev
```
