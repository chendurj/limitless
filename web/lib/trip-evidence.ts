import type { components } from "../types/api";
import directory from "../data/venue-visit-links.json" with { type: "json" };

type Item = components["schemas"]["ItemOut"];
type Place = components["schemas"]["PlaceOut"];
type Fact = components["schemas"]["Fact"];
export type VenueLink = {
  catalog_id: string; name: string; aliases?: string[];
  kind: string; url: string; source_url: string; reviewed_on: string;
  review_method: string; accessibility_url?: string; scope_note?: string; notice?: string;
};
export const venueLinks: readonly VenueLink[] = directory.venues;

/** External links are data, never executable URLs or guessed booking paths. */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value || /[\u0000-\u0020]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || /(^|\.)(localhost|local|internal|example|invalid|test)$/.test(host) || /(^|\.)example\.(com|org|net)$/.test(host)) return null;
    return url.href;
  } catch { return null; }
}

const nameKey = (name: string) => name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[’']/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Exact venue/explicit alias only: never guess which branch a similar name means. */
export function findVenueLink(name: string): VenueLink | undefined {
  const key = nameKey(name);
  return venueLinks.find(row => [row.name, ...(row.aliases ?? [])].some(name => nameKey(name) === key));
}

export function visitAction(place: Place) {
  const entry = findVenueLink(place.name);
  const url = safeExternalUrl(entry?.url) ?? safeExternalUrl(place.website);
  const curated = Boolean(entry && safeExternalUrl(entry.url));
  const label = curated ? ({ tickets: "View tickets", reservation: "Find a table", events: "View events", visit: "Visit info" }[entry!.kind] ?? "Visit info") : "Venue website";
  return {
    url, label, entry: curated ? entry : undefined,
    domain: url ? new URL(url).hostname.replace(/^www\./, "") : null,
    accessibilityUrl: safeExternalUrl(entry?.accessibility_url) ?? safeExternalUrl(place.accessibility_url),
  };
}

export function uniqueText(values: string[]): string[] {
  const seen = new Set<string>();
  return values.map(value => value.trim()).filter(value => {
    const key = value.toLowerCase().replace(/\s+/g, " ");
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export function isDemoFact(fact: Fact): boolean {
  return /demo|synthetic/i.test(`${fact.source} ${fact.source_label}`);
}
export function factLabel(fact: Fact): string {
  if (isDemoFact(fact)) return "Demo data · not verified";
  if (fact.confidence === "INFERRED") return "Inferred · needs checking";
  if (fact.confidence === "COMMUNITY") return "Community report";
  return safeExternalUrl(fact.source_url) ? "Verified record" : "Source link missing";
}
export function citedFacts(item: Item): Fact[] {
  const ids = new Set(item.cited_fact_ids);
  const seen = new Set<number>();
  return (item.place?.facts ?? []).filter(fact => {
    if (!ids.has(fact.fact_id) || seen.has(fact.fact_id)) return false;
    seen.add(fact.fact_id); return true;
  });
}

/** Keep an opposing record visible; a positive citation never hides a known negative. */
export function conflictingFacts(item: Item): Fact[] {
  const cited = citedFacts(item);
  return (item.place?.facts ?? []).filter(fact => cited.some(other =>
    other.attribute === fact.attribute &&
    ((other.value === "yes" && fact.value === "no") || (other.value === "no" && fact.value === "yes")),
  ));
}
export function evidenceWarnings(item: Item): string[] {
  return uniqueText(conflictingFacts(item).map(fact =>
    `Sources disagree about ${fact.attribute.replaceAll("_", " ")}. Confirm this with the venue before booking.`,
  ));
}
