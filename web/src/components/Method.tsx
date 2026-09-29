import { SOURCES } from "@/lib/assumptions";

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
          10,000+). Search for Decatur, GA and you get the Atlanta metro.
        </p>
        <p>
          <strong>Counts.</strong> Population, sex, age and marital status come straight from the{" "}
          <Src s={SOURCES.acs} />, the most recent release that covers every metro (the 2025 release has been
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
          35-year-olds overall.
        </p>
        <p>
          <strong>The survey steps</strong> are national, by age and sex, and applied as multipliers, so treat
          them as educated guesses (they&apos;re marked <em>est.</em> and can be switched off). When you stack
          several Census filters in a small metro, fewer than about 30 survey records may stand behind the result;
          those steps get a <em>thin data</em> tag.
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
          <strong>Height and health.</strong> Height filters use measured heights by sex and age from{" "}
          <Src s={SOURCES.nhanes} />. Smoking and BMI start from NHANES rates for unpartnered adults by sex and age
          (BMI is measured, not self-reported), then shift up or down by how the metro, or its state where the CDC
          doesn&apos;t survey the metro, compares with the US in the <Src s={SOURCES.brfss} />. They&apos;re treated as
          independent of the Census filters, which overstates the pool slightly when you combine them (smoking falls
          with education, for example). The 2024 vote in the context card sums county results from{" "}
          <Src s={SOURCES.election} />.
        </p>
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
