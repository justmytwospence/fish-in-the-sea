import { SOURCES } from "@/lib/assumptions";
import { CONDITIONING } from "@/lib/conditioning";

function Src({ s }: { s: { label: string; url: string } }) {
  return (
    <a href={s.url} target="_blank" rel="noreferrer" className="underline">
      {s.label}
    </a>
  );
}

export default function Method({ dataYear }: { dataYear: string }) {
  return (
    <section id="method" aria-label="Methodology" className="mt-16 border-t border-rule pt-10 text-[15px] leading-relaxed">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">How this works</p>
      <h2 className="mt-3 font-display text-3xl tracking-tight">The fine print</h2>

      <div className="mt-6 space-y-5 text-muted [&_strong]:text-ink">
        <p>
          <strong>Geography.</strong> Dating markets are metro areas, not city limits, so every city maps to its
          Census metropolitan or micropolitan statistical area (a county-based region around an urban core of
          10,000+). Search for Decatur, GA and you get the Atlanta metro. Towns outside any metro or micro area use
          their county, so Crested Butte, CO is Gunnison County. County samples are small, so treat rural numbers
          as rough.
        </p>
        <p>
          <strong>Counts.</strong> Population, sex, age and marital status come straight from the{" "}
          <Src s={SOURCES.acs} />, the most recent release that covers every county (the 2025 release has been
          delayed indefinitely). Those counts are centered around 2022, so each sex and age group is scaled to the{" "}
          <Src s={SOURCES.pep} /> while keeping the ACS marital-status mix. ACS reports ages in five-year bins;
          custom ranges are split using single-year-of-age shares from the microdata. &ldquo;Not married&rdquo; means
          never married, divorced or widowed. ({dataYear}.)
        </p>
        <p>
          <strong>Cohabitation, education, kids, living situation, income.</strong> Census tables don&apos;t cross
          marital status with these, so they come from the <Src s={SOURCES.pums} />: for each sex, age bin and
          marital status we measure the share living with a partner (or in an institution), and the joint mix of
          education, own children under 18 at home, living in a parent&apos;s home and personal income, for the
          microdata areas that overlap each metro. Small metros borrow strength from
          their Census division. Measuring these jointly, instead of multiplying separate percentages, keeps real
          correlations: unmarried 35-year-olds are more likely to have a degree and less likely to have kids than
          35-year-olds overall. The microdata carry income in four brackets (under $25k, $25k–60k, $60k–120k,
          $120k+); an income floor inside a bracket keeps the national share of that bracket above it, by sex and age.
        </p>
        <p>
          <strong>The survey steps</strong> come from national surveys and are applied as shares of whoever is
          left, so treat them as educated guesses (they&apos;re marked <em>est.</em> and can be switched off). Each
          is worked out separately for every combination of education, kids at home and race/ethnicity among
          who&apos;s left, so a step can depend on those where the survey supports it. The table below says exactly
          what each one depends on and what it assumes away. When you stack several Census filters in a small
          metro, fewer than about 30 survey records may stand behind the result; those steps get a{" "}
          <em>thin data</em> tag.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Orientation: <Src s={SOURCES.gallup} />, with the age gradient from <Src s={SOURCES.nsfg} />. Bisexual
            people count toward both sexes.
          </li>
          <li>
            Already seeing someone: weighted estimates, by sex and age, of unpartnered people with a boyfriend,
            girlfriend or partner they don&apos;t live with, from <Src s={SOURCES.gss} />,{" "}
            <Src s={SOURCES.hcmst} /> and <Src s={SOURCES.nsfg2022} />. Question wording matters most: strict
            &ldquo;steady partner&rdquo; items give about 15%, broad &ldquo;romantic partner&rdquo; items 32–38%; the
            sieve uses the middle (about 42% of unpartnered women in their 20s, 24% of men, falling after 55).
          </li>
          <li>
            Looking (off by default): <Src s={SOURCES.pewLooking} />. Under 50, about 57% of singles say they&apos;re
            looking for a relationship or dates. It&apos;s one stated-intent survey question, and plenty of people who
            aren&apos;t &ldquo;looking&rdquo; would date the right person, so it&apos;s an optional extra rather than
            part of the default sieve.
          </li>
        </ul>
        <p>
          <strong>Race and ethnicity.</strong> The optional filter uses each metro&apos;s race and ethnicity mix of
          available singles by sex, age and marital status from the <Src s={SOURCES.pums} /> (Hispanic of any race;
          the other groups non-Hispanic). That mix is then adjusted for each education and income group by how race
          varies with education and income nationally among singles of the same sex, age and marital status (for
          example, far more Asian singles hold graduate degrees), so combining a race filter with a degree or
          income filter no longer treats them as unrelated. The local mix is the metro&apos;s own; only the
          education and income pattern is national. In the competition model, race pairing is a revealed preference like education: how often recent
          couples paired across groups relative to who was single and available. Those patterns reflect
          segregation, social networks and history as much as anyone&apos;s preferences.
        </p>
        <p>
          <strong>Religion and politics.</strong> The Census asks about neither. Both come from one model of the{" "}
          <Src s={SOURCES.ces} />: religion for unmarried adults by sex, age, education and race/ethnicity, and party
          (leaners counted as partisans) given all of those plus religion, with the religion–party link allowed to
          differ by race (white and Black Protestants vote very differently). So a degree, race or religion filter
          changes who&apos;s left politically, and vice versa. The national religion level is calibrated to Pew&apos;s
          2023–24 Religious Landscape Study, since the CES panel runs less religious. Each place is then shifted by
          how its religious mix (Pew&apos;s metro figures where they exist, else its state&apos;s, plus the CES
          respondents who live there, the unmarried ones most) and its 2024 vote (<Src s={SOURCES.election} />)
          differ from the US beyond what its make-up already explains. Where one religion dominates and its members
          marry young (Latter-day Saints in Utah), estimates for young singles are rough. In the competition model,
          religious pairing comes from married couples under 45 in the <Src s={SOURCES.gss} /> and political
          pairing from both partners&apos; party in <Src s={SOURCES.hcmstPolitics} />, each relative to random
          pairing.
        </p>
        <p>
          <strong>Kids someday.</strong> Unpartnered adults answering &ldquo;Do you, yourself, want to have a(nother)
          baby at some time in the future?&rdquo; in the <Src s={SOURCES.nsfgWant} />: yes, no or don&apos;t know, by
          sex, age, education and whether they already have kids. Because it varies with education and kids, it
          follows the mix of who&apos;s left after the Census filters instead of assuming independence. The survey
          covers ages 18–49 here; older ages reuse the 45–49 rates, which likely overstates how many older women
          want kids. The unsure (about 4%) are never ruled out. It&apos;s national, and intentions change.
        </p>
        <p>
          <strong>Height and health.</strong> The height range uses measured heights from{" "}
          <Src s={SOURCES.nhanes} /> by sex, age and race/ethnicity. Smoking and BMI (measured, not self-reported)
          come from a model of NHANES adults by sex, age, degree (bachelor&apos;s or not), race/ethnicity and whether
          they live with a partner, used for the unpartnered; so a college-grad filter now finds fewer smokers, and
          BMI differs by race the way it really does. Each place is then shifted by how its 2024{" "}
          <Src s={SOURCES.brfss} /> rate (or its state&apos;s, where the CDC doesn&apos;t survey the metro) differs from the
          US beyond what its race, education and age make-up already explains, so a place isn&apos;t counted twice for
          its demographics. None of these depend on income, and education only as degree or not. The 2024 vote in
          the context card sums county results from <Src s={SOURCES.election} />.
        </p>
        <div>
          <p>
            <strong>What each estimate depends on.</strong> Everything not listed as a dependency is assumed
            unrelated, given the ones that are.
          </p>
          <div className="-mx-1 mt-3 overflow-x-auto">
            <table className="w-full min-w-[40rem] border-separate border-spacing-x-1 text-[13px] leading-snug">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="border-b border-rule py-2 font-medium">Step</th>
                  <th scope="col" className="border-b border-rule py-2 font-medium">Source</th>
                  <th scope="col" className="border-b border-rule py-2 font-medium">Depends on</th>
                  <th scope="col" className="border-b border-rule py-2 font-medium">Assumed independent of</th>
                  <th scope="col" className="border-b border-rule py-2 font-medium">By place</th>
                </tr>
              </thead>
              <tbody>
                {CONDITIONING.map((c) => (
                  <tr key={c.step} className="align-top">
                    <th scope="row" className="border-b border-rule/60 py-2 pr-2 text-left font-medium text-ink">
                      {c.step}
                    </th>
                    <td className="border-b border-rule/60 py-2 pr-2">{c.source}</td>
                    <td className="border-b border-rule/60 py-2 pr-2 text-ink">{c.on}</td>
                    <td className="border-b border-rule/60 py-2 pr-2">{c.not}</td>
                    <td className="border-b border-rule/60 py-2">{c.local}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p>
          <strong>Competition</strong> is a revealed-preference choice model fitted to couples formed in the last one to
          three years (age, education, income and marriage history), plus published estimates for kids and height. It
          scores every available competitor by how well they match what your targets go for. Your competition-adjusted
          pool is your pool divided by the number of serious competitors per person in it (counting competitors by
          appeal, so long shots count for little), times your appeal relative to a typical serious competitor. With
          one serious competitor per person and you exactly typical, it equals the raw pool. Your filters are your
          preferences, not your competitors&apos;, so how crowded the market is gets measured on the pool before
          your filters, while how you stack up uses what your filtered pool goes for. Details are in the
          competition section.
        </p>
        <p>
          <strong>Known gaps.</strong> Census records sex, not gender identity. Men&apos;s children are inferred from
          household relationships, so kids who live elsewhere are invisible. Nothing here knows whether anyone
          would like you. Inspired by <Src s={SOURCES.backus} />.
        </p>
      </div>
    </section>
  );
}
