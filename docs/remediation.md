# Remediation and release evidence

## Canonical checkout

The complete `worktree-matchmaker-v1` application was fast-forwarded into root `main`; root raw data, cached intermediates and local Vercel configuration were retained. After root verification and confirming no process still owned it, the clean stray worktree was removed through `worktree rm` without force. Root is now the only checkout. The old branch remains a recovery reference; local-only intermediates/configuration are preserved in ignored `pipeline/recovery/matchmaker-v1-local-only.tar.gz`. Shared raw data remains in the physical root `pipeline/raw/` directory.

## Corrected risks

- Full state/county/tract joins replace the corrupt state/tract join. Connecticut populated-tract identity is checked separately across the county transition; ambiguous relationships fail. Census documentation confirms that the 2024 five-year PUMS already crosswalks earlier records to 2020 PUMAs.
- Non-partitioning allocations, unmatched PUMAs, unsupported market coverage, invalid codes, nonfinite estimates and broken probability distributions fail validation.
- Local joint race/education-income calibration preserves both local margins. The funnel has a shared ordered registry and enforces invariants rather than broadly clamping attribution errors.
- Kids-someday filtering is limited to 18–49 and marginalizes biological parenthood. ACS children at home is not substituted for survey parenthood.
- Disabled spark is distinct from zero probability; pool and competition-index scaling agree. Profile changes cannot alter market crowding. Height filtering is explicit with matching control/parser limits.
- Competition fits recent marriages, with state/year alternatives and 2024 household-separated validation. Unknown-duration cohabitation is a separate sensitivity artifact. Same-sex religious pairing without evidence is omitted. Failed validation returns unavailable, not zero.
- The UI separates estimated pool, spark scenario and competition index; removes personal-appeal verdicts and forecast claims; explains geography, sample borrowing and uncertainty.
- Edits are session-only, with explicit save/load/forget/share. Share previews default to basic settings; metadata and images are generic. Ranking uses bounded POST bodies and private/no-store responses, eight lazy deterministic partitions and two concurrent requests.
- Worker calculations have query ids and atomic committed results. Load failures are retryable, and partial nationwide ranks are never displayed. Keyboard place search, table alternatives, focus outlines and reduced-motion behavior were added.
- Artifact manifests bind code/source checksums, seeds, support bounds and a common build id. Mixed snapshot loads fail rather than silently computing on stale formats.

## Verification measurements

Snapshot `30ceaeee36219adc` passed structural and checksum verification for all 2,225 markets. It covers 2,462 PUMAs, conserves 334,844,920 populated-tract residents, has zero unmatched PUMAs and zero invalid PUMS codes, and has maximum allocation-sum error 1.11e-16.

Allocation/serialization-precision impact (both sexes, unmarried groups, corrected counts held fixed; not full dating-model comparisons):

| Place | Weighted attribute total variation | College degree / no children at home / unpartnered share, before → after |
|---|---:|---:|
| New York area | 2.909% | 26.960% → 28.416% |
| Salt Lake City area | 0.471% | 19.578% → 19.733% |
| Hartford area | 0.062% | 22.149% → 22.150% |
| Gunnison County | 0.068% | 17.641% → 17.639% |

Small changes include the switch from coarse rounded distributions to higher precision. Census population counts were unchanged in all four preserved comparisons.

Recent-marriage holdout diagnostics (log loss; lower is better). Availability-only loss is 2.773 in every direction. Confidence bounds bootstrap 2024 households with fitted models held fixed, not individual rows.

| Chooser → partner | Holdout households | Full / age-only log loss | 95% improvement interval vs age-only |
|---|---:|---:|---:|
| Woman → man | 17,502 | 1.197 / 1.667 | 0.454–0.485 |
| Man → woman | 17,412 | 1.126 / 1.513 | 0.371–0.404 |
| Man → man | 886 | 1.537 / 1.950 | 0.352–0.465 |
| Woman → woman | 1,178 | 1.378 / 1.772 | 0.342–0.445 |

All four primary fits converged and passed the positive-improvement gate. Each chooser-age band has at least 50 held-out households. Separate cohabitation sensitivity also passed the predictive comparisons but does not justify treating undated unions as recent. Fits use deterministic input ordering, chooser weights, recorded seeds and state/year alternatives. Known-coefficient simulation and special/missing survey-code tests pass.

Health adjustments use metro/division information in 114 markets and state fallbacks in 2,111; survey vintages are 2023 or 2024. Election adjustments are unavailable in 26 markets. The manifest records this provenance, and area context discloses health fallback/vintage.

Final automated verification passed: lint, TypeScript, 23 Vitest tests, eight Python tests, production build and all 14 Playwright cases in production mode (one test worker). Tests cover desktop/mobile, expanded preference/profile controls, light/dark axe checks with zero critical/serious violations, desktop 200% zoom, reduced motion, privacy and legacy links, unsupported fertility ages, explicit-zero spark, worker failures/retries, stale-query races and complete ranking loads with a maximum of two requests. Warm interactive query updates recorded no main-thread long tasks at or above 50 ms; this is not a general cold-start or on-device performance certification.

Ranking retries drain failed HTTP response bodies and wait for canceled lanes. Dropdown nesting and keyboard focus for horizontally scrollable methodology tables were corrected. Screenshots were generated under `web/test-results/` and desktop/mobile views inspected; these local artifacts are ignored by Git and uploaded by CI.

Stray-checkout removal completed after verification, without force; the recovery branch and local-only archive remain. Manual screen-reader and representative real-device checks remain release gates. No commit, push or deployment was performed.

## Release limitations

- Observed pairing is not an identified preference model or a validation of dating success. Married income is measured after union formation; networks and selection remain unobserved.
- Synthetic estimates have no comprehensive nominal confidence interval. Displayed sampling ranges are approximate ACS-only ranges and exclude allocation, calibration and model error.
- Sparse markets borrow regional/national information. Effective support is not a local respondent count. Exact nationwide rank differences have not been given confidence intervals; thin support and sensitivity should be treated as warnings.
- BRFSS/local belief shifts are ecological approximations, not direct measurements of every single subgroup. Some source locations use state or older-year fallbacks. These are recorded where available, but coverage is not uniform.
- Cross-sectional age scenarios are not forecasts. Census sex categories are retained; sex is not gender identity. Kids-someday coverage stops at age 49.
- Hosting infrastructure may log URLs or access metadata despite application-level POST/no-store precautions. Sensitive settings included in explicit shared links remain readable by their recipients.
- Human screen-reader testing and representative on-device performance are required in addition to automated accessibility and browser checks. Competition associations and market boundaries are not moving recommendations.
