import type { components } from "@/types/api";
import { citedFacts, conflictingFacts, evidenceWarnings, factLabel, isDemoFact, safeExternalUrl, uniqueText, visitAction } from "@/lib/trip-evidence";

type Item = components["schemas"]["ItemOut"];
const linkClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold";

function External({ href, children, className = "text-primary underline underline-offset-4" }: { href: string; children: React.ReactNode; className?: string }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{children}<span aria-hidden="true"> ↗</span><span className="sr-only"> (opens in a new tab)</span></a>;
}

/** Uses the planner's existing explanation and actual citations. No new access inference. */
export function StopFit({ item }: { item: Item }) {
  const cited = citedFacts(item);
  const facts = [...new Map([...cited, ...conflictingFacts(item)].map(fact => [fact.fact_id, fact])).values()];
  const conflict = evidenceWarnings(item).length > 0;
  const restriction = item.place ? visitAction(item.place).entry?.notice : undefined;
  const fullyVerified = facts.length > 0 && facts.every(fact => fact.confidence === "VERIFIED" && !isDemoFact(fact) && safeExternalUrl(fact.source_url));
  const action = item.place ? visitAction(item.place) : null;
  const missing = item.cited_fact_ids.some(id => !facts.some(fact => fact.fact_id === id));
  return (
    <section aria-label={`Why ${item.title} is in your plan`} className="mt-3 text-sm">
      {restriction && <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
        <p className="font-semibold">Access restriction</p><p className="mt-1">{restriction}</p>
      </div>}
      <h4 className="font-semibold">{conflict || restriction ? "Why it was suggested" : "Why this stop"}</h4>
      <p className="mt-1 text-sm leading-relaxed">{item.rationale.trim() || "A personal reason is not available yet."}</p>
      {!fullyVerified && <p className="mt-2 text-sm font-medium text-muted">Access not fully confirmed.</p>}
      {(
        <details className="mt-3 border-t border-border pt-3">
          <summary className="cursor-pointer text-sm font-semibold text-primary">Details & sources</summary>
          {missing && <p className="mt-2 text-muted">Some source details are missing from this trip.</p>}
          {!facts.length && <p className="mt-2 text-muted">No supporting source details are available yet.</p>}
          {action?.accessibilityUrl && <p className="mt-3"><External href={action.accessibilityUrl}>Venue access information</External></p>}
          {item.place?.research_summary && <div className="mt-3"><p className="font-semibold">Official-source research</p><p className="mt-1">{item.place.research_summary}</p>
            <ul className="mt-2 space-y-2">{(item.place.research_sources ?? []).filter(source => safeExternalUrl(source.url)).map(source => <li key={source.url}><External href={source.url}>{source.title}</External></li>)}</ul>
            <p className="mt-2 text-xs text-muted">Source review does not mean every access feature is verified.</p></div>}
          {item.insights.map((insight, i) => <p key={i} className="mt-3">{insight.text}{insight.includes_demo_data ? " (includes demo data)" : ""}</p>)}
          <ul className="mt-3 space-y-3">
            {facts.map(fact => {
              // Demo data never gains credibility just because it carries a URL or VERIFIED enum.
              const source = safeExternalUrl(fact.source_url);
              return <li key={fact.fact_id} className="rounded-lg bg-surface p-3 text-sm">
                <p>{fact.detail || `${fact.attribute.replaceAll("_", " ")}: ${fact.value}`}</p>
                <p className="mt-1 text-xs font-semibold text-muted">{factLabel(fact)}</p>
                {fact.source_label && !isDemoFact(fact) && <p className="mt-1 text-xs text-muted">{fact.source_label}</p>}
                {source ? <div className="mt-2"><External href={source}>Read source</External></div> : <p className="mt-1 text-xs text-muted">No source link available.</p>}
                {fact.verified_at && <p className="mt-1 text-xs text-muted">Record checked: {fact.verified_at}</p>}
              </li>;
            })}
          </ul>
          {action?.entry && <p className="mt-3 text-xs text-muted">Link {action.entry.review_method === "official_page_review" ? "reviewed" : "from research"}: {action.entry.reviewed_on}. Check current prices, times and availability with the venue.</p>}
        </details>
      )}
    </section>
  );
}

export function StopBooking({ item }: { item: Item }) {
  if (!item.place || item.status === "skipped") return null;
  const action = visitAction(item.place);
  const checks = uniqueText([...evidenceWarnings(item), ...item.warnings, ...(action.entry?.scope_note ? [action.entry.scope_note] : [])]);
  return (
    <section aria-label={`Visit and booking for ${item.title}`} className="mt-4 border-t border-border pt-4">
      {checks.length > 0 && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
        <h4 className="text-sm font-semibold">Before you go</h4>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{checks.map(check => <li key={check}>{check}</li>)}</ul>
      </div>}
      <div className="flex flex-wrap gap-2">
        {action.url ? <External href={action.url} className={`${linkClass} bg-primary text-primary-foreground hover:bg-primary-hover`}>{action.label}</External> : <p className="text-sm text-muted">No booking link yet.</p>}

      </div>
      {action.url && <p className="mt-2 text-xs text-muted">{action.domain} · Book separately</p>}

    </section>
  );
}
