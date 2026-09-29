# The Denominator

How many people could you actually date? Pick a US metro, your age and sex, and who you're looking for; the site walks the population down one step at a time using Census data and a few national survey rates, then compares the competition and other metros.

## Layout

- `pipeline/` builds static data from the Census Bureau (no API key needed).
- `web/` is the Next.js site. It reads `web/public/data/` and deploys to Vercel.

## Data sources

- ACS 2020-2024 5-year summary tables B01003, B01001, B12002 (counts by sex, age and marital status for every metro and micro area).
- ACS 2020-2024 5-year PUMS (cohabitation, education, own children, single-year age shares, partner-age distributions of recently formed couples).
- 2020 tract-to-PUMA relationship file and July 2023 CBSA delineations (to weight PUMAs into metros).
- National survey assumptions (Gallup, NSFG, Pew, HCMST) live in `web/src/lib/assumptions.ts` with citations.

## Rebuilding the data

```sh
cd pipeline/raw
B=https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF
for t in b01001 b01003 b12002; do curl -O $B/data/5YRData/acsdt5y2024-$t.dat; done
curl -O $B/documentation/Geos20245YR.txt
curl -O https://www2.census.gov/geo/docs/maps-data/data/rel2020/2020_Census_Tract_to_2020_PUMA.txt
curl -O https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx
curl -O https://www2.census.gov/programs-surveys/acs/data/pums/2024/5-Year/csv_pus.zip && unzip csv_pus.zip
duckdb -c "copy (select SERIALNO, SPORDER::INT sporder, STATE::INT st, PUMA::INT puma, PWGTP::INT w, AGEP::INT age, SEX::INT sex, MAR::INT mar, MARHYP::INT marhyp, RELSHIPP::INT rel, SCHL::INT schl, PAOC::INT paoc, PINCP::INT pincp, ADJINC::BIGINT adjinc, ESR::INT esr from read_csv('psam_pus*.csv', union_by_name=true, types={'SERIALNO':'VARCHAR'})) to 'pums.parquet' (format parquet, compression zstd)"
cd .. && uv run python build.py
```

When the ACS 2025 release lands, change `YEAR` in `pipeline/build.py` and the URLs above.

## Running the site

```sh
cd web && npm install && npm run dev
```
