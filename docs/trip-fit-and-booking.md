# Trip fit and venue booking links

Status: local review; do not commit or publish until the user asks.

Each venue stop now presents the planner's existing rationale under “Why this stop,” with evidence tied to `cited_fact_ids` inside one “Details & sources” disclosure. The browser does not generate access claims, change scores or decide eligibility. Missing citations, demo data, inferred claims and missing source links stay explicit. Opposing yes/no records for a cited attribute are shown together and trigger a visible warning. Existing warnings and researched restrictions appear before booking actions.

The directory at `web/data/venue-visit-links.json` covers the 42 entries in `data/san-diego-accessibility-reviewed-42.json`. It is matched by full venue name or an explicit alias, never a fuzzy match or a generic catalog ID alone. It does not resolve uncertain entrances, routes or campuses.

- **View tickets:** an official page offering tickets, sometimes through the operator's linked checkout.
- **Find a table:** the restaurant's own page linking to its reservation system. Donna Jean is explicitly scoped to San Diego.
- **View events:** the official event or theater site; accessible seats and support must be arranged for the actual performance.
- **Visit info:** general operator or government information. This never implies free entry, no reservation requirement, equipment availability or a ticket checkout.
- **Venue website:** an existing API website for an unmatched place, without claiming we reviewed its booking service.
- Missing or unsafe links show an honest fallback. No booking URL is generated from a venue name.

Official ticket and venue pages were reviewed on 2026-10-18. Entries marked `existing_research_source` reuse the supplied research dated 2026-10-17 and are not described as newly checked pages. Each record retains its source, review date and method. Examples of reviewed pages: [San Diego Zoo](https://zoo.sandiegozoo.org/tickets), [USS Midway](https://www.midway.org/visit/buy-tickets), [San Diego Museum of Art](https://www.sdmart.org/visit-sdma/), [Civico 1845](https://civico1845.com/), [Donna Jean](https://donnajeanrestaurant.com/) and [Old Globe](https://www.theoldglobe.org/). Review dates indicate link research, not current inventory or access verification.

No prices, live availability, fees, commissions, cancellation policies or free-entry claims are stored. A link never reserves entry, equipment, assistance or accessible seating. Booking occurs externally in a new tab with `noopener noreferrer`; no traveler profile or intake answers are appended to these curated URLs. Existing synthetic fixtures remain labeled demo data. No venue accessibility record, score, backend model, trip editing or replan behavior was changed.

Review `/preview/booking` locally without a backend. It shows the full existing labeled Deaf-traveler demo trip, preserving every day, stop and day tab. It demonstrates ticket links, restaurant reservations, general information, missing links and a negative official restriction. It creates no trip or reservation. External links on the preview are real venue pages.

Validation commands (from `web/`, Node 24):

```sh
npm run lint
./node_modules/.bin/tsc --noEmit
node --experimental-strip-types --test tests/trip-evidence.test.mjs
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

The new checks cover directory completeness, exact venue matching, unsafe URLs, distinct action types, evidence integrity, duplicate warnings, conflicting records, mobile layout, keyboard access, skipped stops, external navigation and the standalone preview. External checkout purchases and accessibility arrangements are not performed by tests.

UI simplification: each stop keeps its reason, unconfirmed-access status, important warnings and one venue action visible. Access links, research, traveler insights, citations and link review dates share a single collapsed “Details & sources” section. “Book separately” makes the handoff explicit without repeating a paragraph on every card.
