#!/bin/bash
# Report whether the ACS 2025 data the site depends on has been published.
# Exit 0 and print what's new if anything landed; exit 1 if still waiting.
UA="Mozilla/5.0"
found=0
check() {
  local label=$1 url=$2 pattern=$3
  if curl -s -A "$UA" "$url" | grep -qE "$pattern"; then
    echo "AVAILABLE: $label  $url"
    found=1
  else
    echo "not yet:   $label"
  fi
}
check "ACS 2025 1-year summary tables" \
  https://www2.census.gov/programs-surveys/acs/summary_file/2025/table-based-SF/data/1YRData/ 'acsdt1y2025-b12002'
check "ACS 2021-2025 5-year summary tables" \
  https://www2.census.gov/programs-surveys/acs/summary_file/2025/table-based-SF/data/5YRData/ 'acsdt5y2025-b12002'
check "ACS 2025 PUMS" \
  https://www2.census.gov/programs-surveys/acs/data/pums/ 'href="2025/'
[ $found = 1 ] && exit 0 || exit 1
