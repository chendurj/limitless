import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { citedFacts, conflictingFacts, evidenceWarnings, factLabel, findVenueLink, isDemoFact, safeExternalUrl, uniqueText, venueLinks, visitAction } from '../lib/trip-evidence.ts';
const fixture = JSON.parse(readFileSync(new URL('../fixtures/trip_ankle.json', import.meta.url)));
const item = fixture.days[0].items.find(item => item.place);
const place = item.place;
const research = JSON.parse(readFileSync(new URL('../../data/san-diego-accessibility-reviewed-42.json', import.meta.url)));

test('every researched venue has one auditable official information or booking link', () => {
  assert.equal(venueLinks.length, 42);
  assert.equal(new Set(venueLinks.map(row => row.catalog_id)).size, 42);
  for (const location of research.locations) {
    const link = findVenueLink(location.location_name);
    assert.ok(link, location.location_name);
    assert.equal(link.catalog_id, location.location_id);
    assert.ok(safeExternalUrl(link.url));
    assert.ok(safeExternalUrl(link.source_url));
    assert.match(link.reviewed_on, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(['tickets', 'reservation', 'events', 'visit'].includes(link.kind));
  }
});
test('different campuses and similar names are never guessed', () => {
  assert.equal(findVenueLink('San Diego Zoo').catalog_id, 'sd-041');
  assert.equal(findVenueLink('San Diego Zoo Safari Park').catalog_id, 'sd-042');
  for (const name of ['Zoo', 'Museum', 'San Diego Zoo Downtown', 'Donna Jean Los Angeles', 'Torrey Pines Golf Course']) assert.equal(findVenueLink(name), undefined);
  assert.equal(findVenueLink('San Diego Air & Space Museum').catalog_id, 'sd-053');
});
test('unsafe, placeholder and local links are never exposed', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '//evil.com', 'http://venue.org', 'https://user:secret@venue.org', 'https://localhost', 'https://127.0.0.1', 'https://venue.local', 'https://example.com/book', 'https://venue.example/book', 'https://venue.org:8443/book', 'https://venue.org/\nbook']) assert.equal(safeExternalUrl(url), null, url);
  assert.equal(safeExternalUrl('https://venue.org/book?date=2026-10-23'), 'https://venue.org/book?date=2026-10-23');
});
test('unmatched venue websites remain information links without an official booking claim', () => {
  const action = visitAction({ ...place, name: 'Demo unresearched restaurant', website: 'https://venue.org/' });
  assert.equal(action.label, 'Venue website');
  assert.equal(action.entry, undefined);
  assert.equal(action.domain, 'venue.org');
  assert.equal(visitAction({ ...place, name: 'Demo unresearched restaurant', website: null }).url, null);
});
test('ticket, reservation, event and outdoor information actions remain distinct', () => {
  assert.equal(visitAction({ ...place, name: 'San Diego Zoo' }).label, 'View tickets');
  assert.equal(visitAction({ ...place, name: 'Civico 1845' }).label, 'Find a table');
  assert.equal(visitAction({ ...place, name: 'Old Globe Theatre' }).label, 'View events');
  assert.equal(visitAction({ ...place, name: 'Coronado Central Beach' }).label, 'Visit info');
});
test('demo facts cannot become verified through a confidence enum or a link', () => {
  const fact = { ...place.facts[0], confidence: 'VERIFIED', source_url: 'https://venue.org/' };
  assert.equal(isDemoFact(fact), true);
  assert.equal(factLabel(fact), 'Demo data · not verified');
  assert.equal(factLabel({ ...fact, source: 'official', source_label: '', source_url: null }), 'Source link missing');
  assert.equal(factLabel({ ...fact, source: 'official', source_label: '', confidence: 'INFERRED' }), 'Inferred · needs checking');
});
test('only actual citations appear, once, and stale citation IDs never invent evidence', () => {
  const modified = { ...item, cited_fact_ids: [place.facts[0].fact_id, place.facts[0].fact_id, -999] };
  assert.deepEqual(citedFacts(modified).map(fact => fact.fact_id), [place.facts[0].fact_id]);
  assert.deepEqual(citedFacts({ ...item, place: null }), []);
});
test('warnings are trimmed and deduplicated without dropping different conditions', () => {
  assert.deepEqual(uniqueText([' Call ahead. ', 'call ahead.', '', 'Confirm wheelchair dimensions.']), ['Call ahead.', 'Confirm wheelchair dimensions.']);
});
test('negative and unresolved location information remains visible beside booking links', () => {
  assert.match(findVenueLink('Junipero Serra Museum').notice, /not currently ADA-accessible/);
  assert.match(findVenueLink('Cabrillo Bay Overlook').scope_note, /exact entrance or route/);
  assert.match(findVenueLink('Belmont Park').scope_note, /website, not physical/);
  assert.equal(findVenueLink('Seaport Village').accessibility_url, undefined);
});

test('an opposing negative record cannot be hidden by citing only the positive record', () => {
  const yes = { ...place.facts[0], value: 'yes', fact_id: 1 };
  const no = { ...yes, value: 'no', fact_id: 2 };
  const conflict = { ...item, cited_fact_ids: [1], place: { ...place, facts: [yes, no] } };
  assert.deepEqual(conflictingFacts(conflict).map(f => f.fact_id), [2]);
  assert.match(evidenceWarnings(conflict)[0], /Sources disagree/);
});
