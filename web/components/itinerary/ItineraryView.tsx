"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { components } from "@/types/api";
import { StopFit, StopBooking } from "@/components/itinerary/StopDetails";

type TripOut = components["schemas"]["TripOut"];
type DayOut = components["schemas"]["DayOut"];
type ItemOut = components["schemas"]["ItemOut"];
type ExcludedPlace = components["schemas"]["ExcludedPlace"];

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

export type StatusChange = "in_progress" | "done";

/** Live-mode controls. Without them the itinerary is read-only. */
type Live = {
  onStatus: (item: ItemOut, status: StatusChange) => void;
  busyItemId: string | null;
};

const statusLabel: Partial<Record<ItemOut["status"], string>> = {
  in_progress: "You are here",
  done: "Done",
  skipped: "Skipped",
};

const kindLabel: Record<ItemOut["kind"], string> = {
  visit: "Visit",
  meal: "Meal",
  rest: "Rest",
};

function Score({ label, value }: { label: string; value: number }) {
  const low = value < 50;
  return (
    <span
      className={`inline-flex items-baseline gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${
        low
          ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
          : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
      }`}
    >
      {label}
      <span className="text-sm">{value}</span>
      <span className="font-normal">/100</span>
    </span>
  );
}

function Scores({ item }: { item: ItemOut }) {
  const access = item.accessibility_score;
  const verified = item.verification_score;
  if (access == null && verified == null) return null;
  return (
    <p className="mt-3 flex flex-wrap gap-2">
      {access != null && <Score label="Accessibility" value={access} />}
      {verified != null && <Score label="Verification" value={verified} />}
    </p>
  );
}

function StatusControls({ item, live }: { item: ItemOut; live: Live }) {
  if (!item.place || item.status === "done" || item.status === "skipped")
    return null;
  const busy = live.busyItemId === item.id;
  const action =
    item.status === "in_progress"
      ? { status: "done" as const, label: "Mark as done" }
      : { status: "in_progress" as const, label: "I’m here" };
  return (
    <button
      type="button"
      disabled={busy || live.busyItemId !== null}
      onClick={() => live.onStatus(item, action.status)}
      aria-label={`${action.label}: ${item.title}`}
      className="mt-4 inline-flex h-11 items-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? "Saving…" : action.label}
    </button>
  );
}

function ItemCard({ item, live }: { item: ItemOut; live?: Live }) {
  const status = statusLabel[item.status];
  return (
    <li
      className={`rounded-xl border bg-surface p-5 ${
        item.status === "in_progress"
          ? "border-primary border-2"
          : "border-border"
      } ${item.status === "done" ? "opacity-75" : ""}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-muted">
          {fmtTime(item.start)} – {fmtTime(item.end)}
        </p>
        <span className="flex gap-2">
          {status && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold">
              {item.status === "done" && <span aria-hidden="true">✓ </span>}
              {status}
            </span>
          )}
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-muted">
            {kindLabel[item.kind]}
          </span>
        </span>
      </div>
      <h3 className="mt-1 text-lg font-semibold">{item.title}</h3>
      {item.travel && (
        <p className="mt-1 text-sm text-muted">
          {item.travel.minutes} min {item.travel.mode}
          {item.travel.estimated ? " (estimated)" : ""}
        </p>
      )}
      <Scores item={item} />
      {item.place ? <StopFit item={item} /> : item.rationale && <p className="mt-3 text-sm">{item.rationale}</p>}
      {item.locked && <p className="mt-2 text-xs font-medium text-primary">Kept during AI re-planning</p>}
      {item.user_note && <p className="mt-3 rounded-lg border border-border p-3 text-sm"><span className="font-semibold">Your note:</span> {item.user_note}</p>}

      {(!item.place || item.status === "skipped") && item.warnings.length > 0 && (
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

      <StopBooking item={item} />

      {live && <StatusControls item={item} live={live} />}
    </li>
  );
}

function DaySection({ day, live }: { day: DayOut; live?: Live }) {
  const headingId = `day-${day.day_index}-heading`;
  return (
    <section
      id={`day-${day.day_index}`}
      role="tabpanel"
      aria-labelledby={`day-${day.day_index}-tab`}
      tabIndex={-1}
    >
      <h2 id={headingId} className="text-xl font-bold">
        Day {day.day_index + 1} · {fmtDate(day.date)}
      </h2>
      <p className="mt-1 text-muted">{day.theme}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        {day.weather && (
          <span>
            {Math.round(day.weather.tmax_f)}°F · {day.weather.precip_prob}% rain
            · UV {day.weather.uv_max}
            {day.weather.advisory ? ` · ${day.weather.advisory}` : ""}
          </span>
        )}
        <span>
          Energy: {day.energy_used} of {day.energy_budget}
        </span>
      </div>
      <ol className="mt-5 space-y-4">
        {day.items.map((item) => (
          <ItemCard key={item.id} item={item} live={live} />
        ))}
      </ol>
    </section>
  );
}

// Today in San Diego, as YYYY-MM-DD.
const todayInSanDiego = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

// One day at a time. The tabs follow the WAI-ARIA tabs pattern: arrow keys, Home and End
// move between days, and only the selected tab is in the Tab order.
function DayTabs({ days, live }: { days: DayOut[]; live?: Live }) {
  const [selected, setSelected] = useState(() =>
    Math.max(
      0,
      days.findIndex((day) => day.date === todayInSanDiego()),
    ),
  );
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.min(selected, days.length - 1);
  const day = days[index];

  const select = (next: number) => {
    setSelected(next);
    tabs.current[next]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const last = days.length - 1;
    const next = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    select(next);
  };

  if (!day) return null;
  return (
    <>
      <div
        role="tablist"
        aria-label="Trip days"
        onKeyDown={onKeyDown}
        className="mt-6 flex flex-wrap gap-2"
      >
        {days.map((d, i) => (
          <button
            key={d.day_index}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            id={`day-${d.day_index}-tab`}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-controls={`day-${d.day_index}`}
            tabIndex={i === index ? 0 : -1}
            onClick={() => setSelected(i)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
              i === index
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface hover:bg-surface-muted"
            }`}
          >
            Day {d.day_index + 1}
          </button>
        ))}
      </div>

      <div className="mt-8">
        <DaySection key={day.day_index} day={day} live={live} />
      </div>
    </>
  );
}

const SHOWN_SKIPPED = 5;
// Reasons from an official page are the strongest, so they come first.
const isOfficial = (place: ExcludedPlace) =>
  place.reasons.some((reason) => reason.includes("(the official"));

function SkippedRow({ place }: { place: ExcludedPlace }) {
  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <p className="font-semibold">{place.name}</p>
      <ul className="mt-1 list-disc pl-5 text-sm text-muted">
        {place.reasons.map((reason, i) => (
          <li key={i}>{reason}</li>
        ))}
      </ul>
    </li>
  );
}

function SkippedPlaces({ places }: { places: ExcludedPlace[] }) {
  const sorted = [
    ...places.filter(isOfficial),
    ...places.filter((place) => !isOfficial(place)),
  ];
  const first = sorted.slice(0, SHOWN_SKIPPED);
  const rest = sorted.slice(SHOWN_SKIPPED);
  return (
    <section
      aria-labelledby="skipped-heading"
      className="mt-12 border-t border-border pt-8"
    >
      <h2 id="skipped-heading" className="text-xl font-bold">
        Places we skipped, and why
      </h2>
      <p className="mt-2 text-sm text-muted">
        We skipped {places.length} {places.length === 1 ? "place" : "places"}{" "}
        that do not fit your needs.
      </p>
      <ul className="mt-4 space-y-3">
        {first.map((place) => (
          <SkippedRow key={place.place_id} place={place} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-primary underline underline-offset-4">
            Show all {places.length} places
          </summary>
          <ul className="mt-3 space-y-3">
            {rest.map((place) => (
              <SkippedRow key={place.place_id} place={place} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function ItineraryView({
  trip,
  live,
  actions,
}: {
  trip: TripOut;
  live?: Live;
  /** Shown under the trip summary, for example the Tell Limitless button. */
  actions?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <p className="mb-4 rounded-lg border border-border bg-surface-muted px-3 py-2 text-xs font-medium text-muted">
        Demo trip — accessibility facts are demo data, not verified.
      </p>

      <h1 className="text-3xl font-bold tracking-tight">Your San Diego trip</h1>
      <p className="mt-3 text-muted">{trip.profile_summary}</p>
      <p className="mt-2 text-sm text-muted">
        {trip.nights} nights · {trip.travelers} travelers · from{" "}
        {trip.start_date}
      </p>
      <p className="mt-3 text-sm text-muted">
        <strong className="font-semibold text-foreground">
          Accessibility Score
        </strong>
        : how well a place fits your needs.{" "}
        <strong className="font-semibold text-foreground">
          Verification Score
        </strong>
        : how much we trust the facts behind it. Demo data scores low until a
        person checks it.
      </p>
      {actions && <div className="mt-6">{actions}</div>}

      <DayTabs days={trip.days} live={live} />

      {trip.excluded.length > 0 && <SkippedPlaces places={trip.excluded} />}

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
