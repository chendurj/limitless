import { test, expect, type Page } from '@playwright/test';
import fixture from '../../fixtures/trip_ankle.json';
import deafFixture from '../../fixtures/trip_deaf.json';
import type { components } from '../../types/api';

async function preview(page: Page, options: { name?: string; website?: string | null; noFacts?: boolean; stale?: boolean; status?: 'planned' | 'skipped' } = {}) {
  const trip = structuredClone(fixture) as unknown as components["schemas"]["TripOut"];
  const item = trip.days[0].items.find(item => item.place)!;
  item.place!.name = options.name ?? 'San Diego Zoo';
  item.title = item.place!.name;
  item.place!.website = options.website ?? null;
  item.rationale = 'Demo planner explanation: this stop is part of your museum and wildlife day.';
  item.warnings = ['Confirm assistance before visiting.', ' Confirm assistance before visiting. '];
  if (options.noFacts) { item.place!.facts = []; item.cited_fact_ids = []; item.rationale = ''; }
  if (options.stale) item.cited_fact_ids = [-1];
  if (options.status) item.status = options.status;
  trip.days = [{ ...trip.days[0], items: [item] }];
  await page.route('**/api/trips/**', route => route.fulfill({ json: trip }));
  await page.goto(`/trips/${trip.id}`);
  await expect(page.getByRole('heading', { name: item.title, exact: true })).toBeVisible();
  return item;
}

test('official ticket links and cited demo evidence stay clearly separate', async ({ page }) => {
  await preview(page);
  await expect(page.getByRole('heading', { name: 'Why this stop', exact: true })).toHaveCount(1);
  const link = page.getByRole('link', { name: /View tickets/ });
  await expect(link).toHaveAttribute('href', 'https://zoo.sandiegozoo.org/tickets');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await page.getByText(/Details & sources/).click();
  await expect(page.getByText('Demo data · not verified', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Confirm assistance before visiting.', { exact: true })).toHaveCount(1);
  await expect(page.getByText(/Book separately/)).toBeVisible();
});

test('missing evidence and unsupported URLs do not invent a booking option', async ({ page }) => {
  await preview(page, { name: 'Demo unmatched venue', website: 'javascript:alert(1)', noFacts: true });
  await expect(page.getByText('No booking link yet.')).toBeVisible();
  await expect(page.getByText(/A personal reason is not available yet/)).toBeVisible();
  await expect(page.getByText(/Access not fully confirmed/)).toBeVisible();
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
});

test('negative official information is visible without opening disclosures', async ({ page }) => {
  await preview(page, { name: 'Junipero Serra Museum' });
  await expect(page.getByText(/Serra Museum and presidio site are not currently ADA-accessible/)).toBeVisible();
  await expect(page.getByRole('link', { name: /View tickets/ })).toHaveCount(0);
});

test('event bookings ask travelers to choose a performance and confirm seating', async ({ page }) => {
  await preview(page, { name: 'Old Globe Theatre' });
  await expect(page.getByRole('link', { name: /View events/ })).toHaveAttribute('href', 'https://www.theoldglobe.org/');
  await expect(page.getByText(/Choose an actual performance and confirm accessible seating/)).toBeVisible();
});

test('outdoor information never promises free entry or reservable equipment', async ({ page }) => {
  await preview(page, { name: 'Coronado Central Beach' });
  await expect(page.getByRole('link', { name: /Visit info/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Tickets|Book now|Free entry/ })).toHaveCount(0);
  await expect(page.getByText(/Confirm the exact entrance or route/)).toBeVisible();
});

test('stale evidence identifiers produce an honest fallback', async ({ page }) => {
  await preview(page, { stale: true });
  await page.getByText('Details & sources', { exact: true }).click();
  await expect(page.getByText('Some source details are missing from this trip.')).toBeVisible();
});

test('mobile booking actions fit and can be reached with a keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await preview(page);
  const link = page.getByRole('link', { name: /View tickets/ });
  await link.focus();
  await expect(link).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/stop-booking-mobile.png', fullPage: true });
});

test('skipped stops do not encourage a new booking', async ({ page }) => {
  await preview(page, { status: 'skipped' });
  await expect(page.getByRole('region', { name: /Visit and booking for/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /View tickets/ })).toHaveCount(0);
});

test('booking preview preserves the full trip and every day is reachable', async ({ page }) => {
  await page.route('**/api/**', route => route.abort());
  await page.goto('/preview/booking');
  await expect(page.getByText('Demo trip preview', { exact: true })).toBeVisible();
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(deafFixture.days.length);
  let sawTickets = false;
  let sawTable = false;
  let sawRestriction = false;
  for (let i = 0; i < deafFixture.days.length; i++) {
    await tabs.nth(i).click();
    await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    await expect(page.getByRole('tabpanel').locator('h3')).toHaveText(deafFixture.days[i].items.map(item => item.title));
    sawTickets ||= await page.getByRole('link', { name: /View tickets/ }).count() > 0;
    sawTable ||= await page.getByRole('link', { name: /Find a table/ }).count() > 0;
    sawRestriction ||= await page.getByText(/not currently ADA-accessible/).count() > 0;
  }
  expect(sawTickets).toBe(true);
  expect(sawTable).toBe(true);
  expect(sawRestriction).toBe(true);
  await tabs.first().focus();
  await tabs.first().press('End');
  await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: 'test-results/booking-preview-desktop.png', fullPage: true });
});

test('opening a booking link leaves the itinerary intact and shares no profile in its URL', async ({ page, context }) => {
  await preview(page);
  await context.route('https://zoo.sandiegozoo.org/tickets', route => route.fulfill({ contentType: 'text/html', body: '<p>Demo external ticket page for testing.</p>' }));
  const opened = page.waitForEvent('popup');
  await page.getByRole('link', { name: /View tickets/ }).focus();
  await page.keyboard.press('Enter');
  const popup = await opened;
  await popup.waitForLoadState();
  expect(popup.url()).toBe('https://zoo.sandiegozoo.org/tickets');
  await expect(page.getByRole('heading', { name: 'San Diego Zoo', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^I’m here:/ })).toBeVisible();
  await popup.close();
});
