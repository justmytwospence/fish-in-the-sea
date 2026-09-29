# The Denominator

How many people could you actually date? Pick a US metro, your age and sex, and who you're looking for; the site sifts the population one step at a time using Census data and a few survey-based rates, adjusts for competition, and compares metros.

## Layout

- `pipeline/` builds static data (no API keys needed).
- `web/` is the Next.js site. It reads `web/public/data/` and deploys to Vercel.

## Data sources

- ACS 2020-2024 5-year summary tables B01003, B01001, B12002 (counts by sex, age and marital status for every metro and micro area), scaled to the Census Vintage 2025 population estimates by metro, sex and single year of age.
- ACS 2020-2024 5-year PUMS: cohabitation, education, own children, living with parents, personal income, single-year age shares, and recently formed couples for the competition model.
- 2020 tract-to-PUMA relationship file and July 2023 CBSA delineations (to weight PUMAs into metros); 2026 Gazetteer place coordinates (search and geolocation); 2024 cartographic CBSA and state boundaries (map).
- NHANES 2017-2023: measured height, measured BMI and smoking by sex, age and partnership status.
- CDC BRFSS 2024 metro (SMART) and state prevalence for smoking and obesity, via data.cdc.gov (datasets j32a-sa6u and dttw-5yxu).
- 2024 presidential results by county (github.com/tonmcg/US_County_Level_Election_Results_08-24).
- Survey and literature assumptions (Gallup, NSFG, GSS, HCMST, Pew, Di Nallo on kids, Hitsch et al. on height) live in `web/src/lib/assumptions.ts` with citations.

## Rebuilding the data

```sh
cd pipeline/raw
UA="Mozilla/5.0"
B=https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF
for t in b01001 b01003 b12002; do curl -O $B/data/5YRData/acsdt5y2024-$t.dat; done
curl -O $B/documentation/Geos20245YR.txt
curl -O https://www2.census.gov/geo/docs/maps-data/data/rel2020/2020_Census_Tract_to_2020_PUMA.txt
curl -O https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx
curl -O https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/metro/asrh/cbsa-est2025-syasex.csv
curl -O https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_place_national.zip && unzip 2026_Gaz_place_national.zip
for f in 2021/DataFiles/DEMO_L 2021/DataFiles/BMX_L 2021/DataFiles/SMQ_L 2017/DataFiles/P_DEMO 2017/DataFiles/P_BMX 2017/DataFiles/P_SMQ; do
  curl -A "$UA" -O https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/$f.xpt; done
curl -L -o pres2024_county.csv https://raw.githubusercontent.com/tonmcg/US_County_Level_Election_Results_08-24/master/2024_US_County_Level_Presidential_Results.csv
curl -O https://www2.census.gov/programs-surveys/acs/data/pums/2024/5-Year/csv_pus.zip && unzip csv_pus.zip
duckdb -c "copy (select SERIALNO, SPORDER::INT sporder, STATE::INT st, PUMA::INT puma, PWGTP::INT w, AGEP::INT age, SEX::INT sex, MAR::INT mar, MARHT::INT marht, MARHYP::INT marhyp, RELSHIPP::INT rel, SCHL::INT schl, PAOC::INT paoc, PINCP::INT pincp, ADJINC::BIGINT adjinc, ESR::INT esr from read_csv('psam_pus*.csv', union_by_name=true, types={'SERIALNO':'VARCHAR'})) to 'pums.parquet' (format parquet, compression zstd)"

# Map: pre-projected, simplified TopoJSON
for g in cbsa state; do curl -O https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_${g}_20m.zip && unzip -o cb_2024_us_${g}_20m.zip -d shp; done
npx mapshaper -i shp/cb_2024_us_cbsa_20m.shp name=cbsa -filter 'NAME.indexOf(", PR") < 0' -filter-fields GEOID -proj albersusa -simplify 12% keep-shapes -o cbsa.json format=topojson quantization=10000
npx mapshaper -i shp/cb_2024_us_state_20m.shp name=states -filter 'STATEFP != "72"' -filter-fields STUSPS -proj albersusa -simplify 12% -o states.json format=topojson quantization=10000
npx mapshaper -i cbsa.json states.json combine-files -o ../../web/public/data/map.json format=topojson bbox

cd .. && uv run python build.py && uv run python choice.py && uv run python context.py
```

- `build.py` writes per-metro counts (ACS scaled to the 2025 estimates) and attribute mixes.
- `choice.py` fits the revealed-preference model behind the competition section (a conditional logit on recently formed couples versus sampled single alternatives, about a minute).
- `context.py` writes heights, health rates and per-metro context (health shifts, 2024 vote) and pulls BRFSS from data.cdc.gov.

`pipeline/check_acs.sh` reports whether the ACS 2025 release has landed; when it has, change `YEAR` in `pipeline/build.py`, update the URLs above and rebuild.

## Running the site

```sh
cd web && npm install && npm run dev
```
