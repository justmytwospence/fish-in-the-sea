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
          <Src s={SOURCES.acs} />, the most recent release that covers every metro ({dataYear}; the 2025 1-year
          release has been delayed). ACS reports ages in five-year bins; custom ranges are split using
          single-year-of-age shares from the microdata. &ldquo;Not married&rdquo; means never married, divorced or
          widowed.
        </p>
        <p>
          <strong>Cohabitation, education, kids.</strong> Census tables don&apos;t cross marital status with these,
          so they come from the <Src s={SOURCES.pums} />: for each sex, age bin and marital status we measure the
          share living with a partner (or in an institution), the education mix and whether own children under
          18 live in the home, for the microdata areas that overlap each metro. Small metros borrow strength from
          their Census division. Measuring these jointly, instead of multiplying separate percentages, keeps real
          correlations: unmarried 35-year-olds are more likely to have a degree and less likely to have kids than
          35-year-olds overall.
        </p>
        <p>
          <strong>The survey steps</strong> are national, by age and sex, and applied as multipliers, so treat
          them as educated guesses (they&apos;re marked <em>est.</em> and can be switched off).
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Orientation: <Src s={SOURCES.gallup} />, with the age gradient from <Src s={SOURCES.nsfg} />. Bisexual
            people count toward both sexes.
          </li>
          <li>
            Already seeing someone: the gap between Pew&apos;s &ldquo;single&rdquo; share (<Src s={SOURCES.pewSingles} />)
            and the ACS unpartnered share, by age, which lands in line with{" "}
            <Src s={SOURCES.hcmst} /> (26–37% of the unpartnered are in a relationship).
          </li>
          <li>
            Looking: <Src s={SOURCES.pewLooking} />. Under 50, about 57% of singles are looking for a relationship or
            dates; single men say they&apos;re looking more often than single women.
          </li>
        </ul>
        <p>
          <strong>Competition</strong> is a revealed-preference choice model fitted to couples formed in the last one to
          three years (age, education, income and marriage history), plus published estimates for kids and height. It
          weights every available competitor by how well they match what your targets go for, and your fair share is
          how many of your targets would pick you if everyone chose in proportion to that appeal. Details are in the
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
