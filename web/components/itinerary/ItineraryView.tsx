import type { components } from "@/types/api";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";

type TripOut = components["schemas"]["TripOut"];
type DayOut = components["schemas"]["DayOut"];
type ItemOut = components["schemas"]["ItemOut"];
type Fact = components["schemas"]["Fact"];

// Times and dates are shown in San Diego time regardless of where this renders.
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
const fmtDate = (date: string) =>
  new Date(`${date}T12:00:00-07:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });

const kindLabel: Record<ItemOut["kind"], string> = {
  visit: "Visit",
  meal: "Meal",
  rest: "Rest",
};

function FactRow({ fact }: { fact: Fact }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <ConfidenceBadge level={fact.confidence} />
      <span>{fact.detail}</span>
      <span className="text-muted">
        {fact.source_url ? (
          <a
            href={fact.source_url}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            {fact.source}
          </a>
        ) : (
          fact.source
        )}
        {fact.verified_at ? ` · checked ${fact.verified_at}` : ""}
      </span>
    </li>
  );
}

function ItemCard({ item }: { item: ItemOut }) {
  return (
    <li className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-muted">
          {fmtTime(item.start)} – {fmtTime(item.end)}
        </p>
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-muted">
          {kindLabel[item.kind]}
        </span>
      </div>
      <h3 className="mt-1 text-lg font-semibold">{item.title}</h3>
      {item.travel && (
        <p className="mt-1 text-sm text-muted">
          {item.travel.minutes} min {item.travel.mode}
          {item.travel.estimated ? " (estimated)" : ""}
        </p>
      )}
      {item.rationale && <p className="mt-3 text-sm">{item.rationale}</p>}

      {item.place && item.place.facts.length > 0 && (
        <ul className="mt-4 space-y-2">
          {item.place.facts.map((fact) => (
            <FactRow key={fact.fact_id} fact={fact} />
          ))}
        </ul>
      )}

      {item.warnings.length > 0 && (
        <ul className="mt-3 space-y-1">
          {item.warnings.map((warning, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
            >
              <span aria-hidden="true">⚠</span>
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      )}

      {item.insights.map((insight, i) => (
        <p key={i} className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm">
          {insight.text}
          {insight.includes_demo_data ? (
            <span className="text-muted"> (includes demo data)</span>
          ) : null}
        </p>
      ))}

      {item.place?.accessibility_url && (
        <p className="mt-3 text-sm">
          <a
            href={item.place.accessibility_url}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-4"
          >
            Venue accessibility page
          </a>
        </p>
      )}
    </li>
  );
}

function DaySection({ day }: { day: DayOut }) {
  const headingId = `day-${day.day_index}-heading`;
  return (
    <section
      id={`day-${day.day_index}`}
      aria-labelledby={headingId}
      className="scroll-mt-6"
    >
      <h2 id={headingId} className="text-xl font-bold">
        Day {day.day_index + 1} · {fmtDate(day.date)}
      </h2>
      <p className="mt-1 text-muted">{day.theme}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        {day.weather && (
          <span>
            {Math.round(day.weather.tmax_f)}°F · {day.weather.precip_prob}% rain ·
            UV {day.weather.uv_max}
            {day.weather.advisory ? ` · ${day.weather.advisory}` : ""}
          </span>
        )}
        <span>
          Energy: {day.energy_used} of {day.energy_budget}
        </span>
      </div>
      <ol className="mt-5 space-y-4">
        {day.items.map((item) => (
          <ItemCard key={item.id} item={item} />
        ))}
      </ol>
    </section>
  );
}

export function ItineraryView({ trip }: { trip: TripOut }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <p className="mb-4 rounded-lg border border-border bg-surface-muted px-3 py-2 text-xs font-medium text-muted">
        Example itinerary — demo data, not verified accessibility facts.
      </p>

      <h1 className="text-3xl font-bold tracking-tight">Your San Diego trip</h1>
      <p className="mt-3 text-muted">{trip.profile_summary}</p>
      <p className="mt-2 text-sm text-muted">
        {trip.nights} nights · {trip.travelers} travelers · from {trip.start_date}
      </p>

      <nav aria-label="Jump to a day" className="mt-6 flex flex-wrap gap-2">
        {trip.days.map((day) => (
          <a
            key={day.day_index}
            href={`#day-${day.day_index}`}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted"
          >
            Day {day.day_index + 1}
          </a>
        ))}
      </nav>

      <div className="mt-8 space-y-12">
        {trip.days.map((day) => (
          <DaySection key={day.day_index} day={day} />
        ))}
      </div>

      {trip.excluded.length > 0 && (
        <section
          aria-labelledby="skipped-heading"
          className="mt-12 border-t border-border pt-8"
        >
          <h2 id="skipped-heading" className="text-xl font-bold">
            Places we skipped, and why
          </h2>
          <ul className="mt-4 space-y-3">
            {trip.excluded.map((place) => (
              <li
                key={place.place_id}
                className="rounded-xl border border-border bg-surface p-4"
              >
                <p className="font-semibold">{place.name}</p>
                <ul className="mt-1 list-disc pl-5 text-sm text-muted">
                  {place.reasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      {trip.rental_links.length > 0 && (
        <section aria-labelledby="rentals-heading" className="mt-10">
          <h2 id="rentals-heading" className="text-lg font-bold">
            Rentals
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {trip.rental_links.map((link) => (
              <li key={link.url}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-primary underline underline-offset-4"
                >
                  {link.label}
                </a>
                <span className="text-muted"> — {link.note}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-10 text-sm text-muted">{trip.disclaimer}</p>
    </div>
  );
}
