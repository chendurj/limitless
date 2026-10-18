import { test, expect, type Page } from '@playwright/test';
import tripFixture from '../../fixtures/trip_ankle.json';
import { intakeScreens, isVisible } from '../../lib/intakeQuestions';

const baseAnswers = { needs: ['other'], party: 'alone', interests: ['beaches'], transport: 'personal_car', pace: 'relaxed' };
const trip = structuredClone(tripFixture);
const tripUrl = `/trips/${trip.id}`;
const intakeResult = { profile_id: 'demo-profile', dna: { summary: 'Demo access needs for testing.' }, followups: [], assumptions: [] };
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  // Test-only guest session: no real Supabase accounts or user data are touched.
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!projectUrl) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL for the guest flow tests.');
  const user = { id: '00000000-0000-4000-8000-0000000000e1', aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: { display_name: 'Demo traveler' }, created_at: '2026-10-18T00:00:00Z' };
  await page.addInitScript(({ projectUrl, user }) => {
    const key = `sb-${new URL(projectUrl).hostname.split('.')[0]}-auth-token`;
    const expires_at = Math.floor(Date.now() / 1000) + 3600;
    const access_token = `${btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${btoa(JSON.stringify({ sub: user.id, exp: expires_at, role: 'authenticated' }))}.test-only-signature`;
    localStorage.setItem(key, JSON.stringify({ access_token, refresh_token: 'test-only-refresh', expires_at, expires_in: 3600, token_type: 'bearer', user }));
  }, { projectUrl, user });
  await page.route('**/auth/v1/**', route => route.fulfill({ json: user }));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page) ?? [], 'No uncaught browser exceptions').toEqual([]);
});
async function seed(page: Page, answers = baseAnswers, index = 5, others = {}) {
  await page.addInitScript(saved => localStorage.setItem('limitless_intake_00000000-0000-4000-8000-0000000000e1', JSON.stringify(saved)), { version: 4, answers, others, index });
  await page.goto('/intake');
}
async function speech(page: Page, supported = true) {
  await page.addInitScript(enabled => {
    const w = window as unknown as Record<string, unknown>;
    w.recognitions = [];
    class Recorder {
      static isTypeSupported() { return true; }
      aborted = false;
      state = 'inactive';
      mimeType = 'audio/webm';
      text = '';
      ondataavailable: ((event: unknown) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() { (w.recognitions as unknown[]).push(this); }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([this.text || 'Demo audio'], { type: 'audio/webm' }) }); this.onstop?.(); }
      emit(text: string) { this.text = text; }
    }
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: enabled ? Recorder : undefined });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      if (w.denyMicrophone) throw new DOMException('Denied for test', 'NotAllowedError');
      const track = { onended: null, stop: () => { const last = (w.recognitions as Recorder[]).at(-1); if (last) last.aborted = true; } };
      return { getTracks: () => [track] };
    } } });
  }, supported);
  await page.route('**/api/transcribe', route => route.fulfill({ json: { text: route.request().postDataBuffer()?.toString() || 'Demo transcript' } }));
}
async function emit(page: Page, text: string) {
  await page.evaluate(value => {
    const w = window as unknown as { recognitions: { emit: (text: string) => void }[] };
    w.recognitions.at(-1)!.emit(value);
  }, text);
}
async function api(page: Page, options: { delay?: number; followups?: unknown[] } = {}) {
  const currentTrip = structuredClone(trip);
  let deleted = false;
  const counts: Record<string, number> = {};
  const bodies: Record<string, Record<string, unknown>[]> = {};
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const key = `${request.method()} ${path}`;
    counts[key] = (counts[key] || 0) + 1;
    if (request.postData()) (bodies[key] ??= []).push(request.postDataJSON());
    if (options.delay) await delay(options.delay);
    if (path === '/api/intake') return route.fulfill({ json: { ...intakeResult, followups: options.followups ?? [] } });
    if (path === '/api/trips' && request.method() === 'GET') return route.fulfill({ json: deleted ? [] : [currentTrip] });
    if (path === `/api/trips/${trip.id}` && request.method() === 'DELETE') { deleted = true; return route.fulfill({ json: { deleted: true } }); }
    if (path === '/api/profiles' && request.method() === 'GET') return route.fulfill({ json: [] });
    if (path.endsWith('/followups')) return route.fulfill({ json: intakeResult });
    if (path.startsWith('/api/profiles/')) return route.fulfill({ json: {} });
    if (path.endsWith('/feedback')) return route.fulfill({ json: { replan: { changed: true, version: 4, message: 'Demo rest added.', changes: [{ type: 'rest_added', day_index: 0, reason: 'Demo extra break.' }] } } });
    if (path.endsWith('/replan')) return route.fulfill({ json: { trip: { ...trip, version: 4 }, message: 'Demo plan restored.' } });
    if (path.includes('/items/')) {
      const item = currentTrip.days.flatMap(day => day.items).find(item => path.endsWith(item.id))!;
      Object.assign(item, request.postDataJSON());
      return route.fulfill({ json: item });
    }
    if (path.startsWith('/api/trips')) return route.fulfill({ json: currentTrip });
    return route.fulfill({ status: 404, json: { error: { message: 'Test endpoint not found.' } } });
  });
  return { counts, bodies };
}
function field(page: Page, id: string) { return page.locator(`[data-question-id="${id}"]`); }

// Includes real recording/transcription when VOICE_TEST_AUDIO is configured.
test('01 desktop homepage navigation is clickable without overlap', async ({ page }) => {
  await page.goto('/');
  await page.locator('#assistant-question').focus();
  await page.getByRole('link', { name: 'Features', exact: true }).click({ timeout: 5000 });
  await expect(page).toHaveURL(/\/features$/);
});
test('02 mobile chat fits the viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.locator('#assistant-question').fill('How can you help me?');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeVisible();
});
test('03 rapid chat submissions create one request and one pair of messages', async ({ page }) => {
  let count = 0;
  await page.route('**/api/chat', async route => { count++; await delay(250); await route.fulfill({ json: { message: 'Demo reply.' } }); });
  await page.goto('/');
  await page.locator('#assistant-question').fill('Help me start.');
  await page.locator('#ask-anything form').evaluate(form => { for (let i = 0; i < 2; i++) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await expect(page.getByRole('log').getByText('Demo reply.', { exact: true })).toHaveCount(1);
  await expect(page.getByRole('log').getByText('Help me start.', { exact: true })).toHaveCount(1);
  expect(count).toBe(1);
});
test('04 failed chat retains the draft and retries without duplicate text', async ({ page }) => {
  let count = 0;
  await page.route('**/api/chat', async route => { count++; await route.fulfill(count === 1 ? { status: 502, json: { error: 'Demo connection error.' } } : { json: { message: 'Recovered reply.' } }); });
  await page.goto('/');
  await page.locator('#assistant-question').fill('Please help.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.locator('#assistant-question')).toHaveValue('Please help.');
  await expect(page.getByRole('alert').filter({ hasText: 'Demo connection error.' })).toBeVisible();
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('log').getByText('Please help.', { exact: true })).toHaveCount(1);
  await expect(page.getByRole('log').getByText('Recovered reply.', { exact: true })).toHaveCount(1);
});
test('05 recorded speech is appended once after transcription completes', async ({ page }) => {
  await speech(page); await page.goto('/');
  await page.locator('#assistant-question').fill('Please');
  await page.getByRole('button', { name: 'Speak your question', exact: true }).click();
  await emit(page, 'help'); await emit(page, 'help me'); await emit(page, 'help me plan');
  await expect(page.locator('#assistant-question')).toHaveValue('Please');
  await page.getByRole('button', { name: 'Stop microphone', exact: true }).click();
  await expect(page.locator('#assistant-question')).toHaveValue('Please help me plan');
});
test('06 every visible question has unique choices and exactly one microphone across all branches', async ({ page }) => {
  await speech(page); await page.goto('/intake');
  const answers = { ...baseAnswers, needs: ['mobility_device', 'deaf_hoh', 'non_speaking'], party: 'family' };
  for (const [index, screen] of intakeScreens.entries()) {
    await page.evaluate(saved => localStorage.setItem('limitless_intake_00000000-0000-4000-8000-0000000000e1', JSON.stringify(saved)), { version: 4, answers, others: {}, index });
    await page.reload();
    await expect(page.getByRole('heading', { name: screen.title, exact: true })).toBeVisible();
    const more = page.getByRole("button", { name: "More options", exact: true });
    if (await more.count()) await more.click();
    for (const question of screen.questions.filter(q => isVisible(q, answers))) {
      const values = question.options?.map(option => option.value) ?? [];
      const labels = question.options?.map(option => option.label.toLowerCase()) ?? [];
      expect(new Set(values).size).toBe(values.length);
      expect(new Set(labels).size).toBe(labels.length);
      const container = field(page, question.id);
      await expect(container.getByRole('button', { name: /^Speak answer:/ })).toHaveCount(question.dateRange ? 2 : 1);
      if (question.options) {
        await expect(container.locator('input[type="radio"], input[type="checkbox"]')).toHaveCount(question.options.length * (question.inputType === 'must-nice' ? 3 : 1));
      }
    }
  }
});
test('07 saved questionnaire restores the selected step and answers on reload', async ({ page }) => {
  await page.goto('/intake');
  await field(page, 'needs').getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
    await field(page, 'walking').getByRole('radio').first().check();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'How much walking feels comfortable?', exact: true })).toBeVisible();
    await expect(field(page, 'walking').getByRole('radio').first()).toBeChecked();
});
test('08 corrupt saved JSON does not break the questionnaire', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('limitless_intake_00000000-0000-4000-8000-0000000000e1', '{broken'));
  await page.goto('/intake');
  await expect(page.getByRole('heading', { name: 'What should we plan around?', exact: true })).toBeVisible();
});
test('09 malformed saved answer shapes and step numbers are discarded safely', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('limitless_intake_00000000-0000-4000-8000-0000000000e1', JSON.stringify({ answers: { needs: { bad: true } }, others: 42, index: -100 })));
  await page.goto('/intake');
  await expect(page.getByRole('heading', { name: 'What should we plan around?', exact: true })).toBeVisible();
  await expect(field(page, 'needs').getByRole('checkbox', { checked: true })).toHaveCount(0);
});
test('10 changing branches does not submit stale hidden access needs', async ({ page }) => {
  const server = await api(page);
  await seed(page, { ...baseAnswers, equipment: ['manual_wheelchair'], hearing_features: ['captions'], party_size: '5' } as typeof baseAnswers);
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Plan my trip', exact: true })).toBeVisible();
  const answers = server.bodies['POST /api/intake'][0].answers as Record<string, unknown>;
  expect(answers).not.toHaveProperty('equipment'); expect(answers).not.toHaveProperty('hearing_features'); expect(answers).not.toHaveProperty('party_size');
});
test('11 Other-only answers and must-have Other text reach the intake API', async ({ page }) => {
  const server = await api(page);
  await seed(page, baseAnswers, 5, { cuisines: 'Demo gluten-free preference', requirements: 'Demo extra requirement' });
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Plan my trip', exact: true })).toBeVisible();
  const answers = server.bodies['POST /api/intake'][0].answers as Record<string, { other: string }>;
  expect(answers).not.toHaveProperty('cuisines');
  expect(answers.requirements?.other).toBe('Demo extra requirement');
});
test('12 only one question is shown per step', async ({ page }) => {
  await seed(page, { ...baseAnswers, needs: ['mobility_device', 'deaf_hoh', 'non_speaking'] }, 0);
  await expect(page.locator('[data-question-id]')).toHaveCount(1);
  await expect(page.getByText('Step 1 of 7', { exact: true })).toBeVisible();
});
test('13 must-have and nice-to-have selections remain mutually exclusive', async ({ page }) => {
  await seed(page, baseAnswers, 1);
  const group = page.getByRole('radiogroup', { name: 'Accessible restroom', exact: true });
  await group.getByRole('radio', { name: 'Must have', exact: true }).check();
  await group.getByRole('radio', { name: 'Nice to have', exact: true }).check();
  await expect(group.getByRole('radio', { checked: true })).toHaveCount(1);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('limitless_intake_00000000-0000-4000-8000-0000000000e1')!));
  expect(saved.answers.requirements).toEqual({ must: [], nice: ['accessible_restroom'] });
  await expect(page.locator('#requirements-other')).toBeVisible();
});
test('14 failed microphone input keeps manual choices usable', async ({ page }) => {
  await speech(page); await seed(page, { ...baseAnswers, needs: ['mobility_device'] }, 1);
  await page.evaluate(() => { (window as unknown as { denyMicrophone: boolean }).denyMicrophone = true; });
  await field(page, 'walking').getByRole('button', { name: /^Speak answer:/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Microphone access is off' })).toBeVisible();
  await field(page, 'walking').getByRole('radio').first().check();
  await expect(field(page, 'walking').getByRole('radio').first()).toBeChecked();
});
test('15 follow-up choices are deduplicated and free text has a real accessible label', async ({ page }) => {
  await api(page, { followups: [
    { id: 'f1', question: 'Demo preference?', answer_type: 'single_choice', options: ['Yes', 'Yes', ' yes ', 'No'] },
    { id: 'f2', question: 'Demo extra detail?', answer_type: 'free_text', options: [] },
  ] });
  await seed(page); await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A few quick questions', exact: true })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(2);
  await expect(page.getByRole('textbox', { name: 'Demo extra detail?', exact: true })).toBeVisible();
});
test('16 repeated Finish and Plan actions send only one request while showing loading state', async ({ page }) => {
  const server = await api(page, { delay: 250 });
  await seed(page);
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'One moment…', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Plan my trip', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Plan my trip', exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(page.getByRole('heading', { name: 'Building your trip…', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your San Diego trip', exact: true })).toBeVisible();
  expect(server.counts['POST /api/intake']).toBe(1); expect(server.counts['POST /api/trips']).toBe(1);
});
test('17 itinerary keyboard tabs show exactly one day and no duplicated stops', async ({ page }) => {
  await api(page); await page.goto(tripUrl);
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(trip.days.length);
  await tabs.first().focus(); await tabs.first().press('End');
  await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
  await tabs.last().press('Home');
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  const titles = await page.getByRole('tabpanel').locator('h3').allTextContents();
  expect(new Set(titles).size).toBe(titles.length);
});
test('18 rapid itinerary status clicks create one update request', async ({ page }) => {
  const server = await api(page, { delay: 150 }); await page.goto(tripUrl);
  const here = page.getByRole('button', { name: /^I’m here:/ }).first();
  await here.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(page.getByRole('button', { name: /^Mark as done:/ }).first()).toBeVisible();
  expect(Object.entries(server.counts).filter(([key]) => key.startsWith('PATCH /api/trips/')).reduce((n, [, count]) => n + count, 0)).toBe(1);
});
test('19 feedback applies once, and repeated Undo clicks create only one restoration', async ({ page }) => {
  const server = await api(page, { delay: 200 }); await page.goto(tripUrl);
  await page.getByRole('button', { name: 'Edit with AI', exact: true }).click();
  await page.locator('#tell-text').fill('Demo: I need a break.');
  await page.getByRole('button', { name: 'Update my plan', exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
  expect(server.counts[`POST /api/trips/${trip.id}/feedback`]).toBe(1);
  expect(server.counts[`POST /api/trips/${trip.id}/replan`]).toBe(2);
});
test('20 cancelling in-flight feedback does not overwrite the next conversation', async ({ page }) => {
  await api(page, { delay: 500 }); await page.goto(tripUrl);
  await page.getByRole('button', { name: 'Edit with AI', exact: true }).click();
  await page.locator('#tell-text').fill('Demo old feedback.');
  await page.getByRole('button', { name: 'Update my plan', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Edit with AI', exact: true }).click();
  await page.locator('#tell-text').fill('Demo new feedback.');
  await delay(700);
  await expect(page.locator('#tell-text')).toHaveValue('Demo new feedback.');
  await expect(page.getByRole('dialog').getByText('Demo rest added.', { exact: true })).toHaveCount(0);
});
test('21 warm local questionnaire navigation responds within one second', async ({ page }, testInfo) => {
  await page.goto('/intake'); await field(page, 'needs').getByRole('checkbox').first().check();
  const start = performance.now();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'How much walking feels comfortable?', exact: true })).toBeVisible();
  const ms = Math.round(performance.now() - start);
  testInfo.annotations.push({ type: 'timing', description: `Warm local questionnaire navigation: ${ms}ms` });
  expect(ms).toBeLessThan(1000);
});
test('22 live assistant returns a nonempty answer and records actual response time', async ({ request, baseURL }, testInfo) => {
  test.skip(process.env.LIVE_CHAT_TEST !== '1', 'Set LIVE_CHAT_TEST=1 with a configured server API key for the live call.');
  test.setTimeout(60000);
  const start = performance.now();
  const response = await request.post('/api/chat', { headers: { Origin: new URL(baseURL!).origin }, data: { messages: [{ role: 'user', content: 'In one short sentence, what can you help me do in Limitless?' }] } });
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(typeof result.message).toBe('string'); expect(result.message.trim().length).toBeGreaterThan(10);
  testInfo.annotations.push({ type: 'timing', description: `Live OpenAI chat response: ${Math.round(performance.now() - start)}ms` });
});

test('23 real browser recording reaches live transcription and selects the reviewed option', async ({ page }, testInfo) => {
  test.skip(!process.env.VOICE_TEST_AUDIO, 'Provide a WAV saying Option one to test real capture and live transcription.');
  test.setTimeout(60000);
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await original(constraints);
      (window as unknown as { capturedStream: MediaStream }).capturedStream = stream;
      return stream;
    };
  });
  await page.goto('/intake');
  const needs = field(page, 'needs');
  await needs.getByRole('button', { name: /^Speak answer:/ }).click();
  await expect(needs.getByRole('button', { name: /^Stop microphone:/ })).toBeVisible();
  await expect(page.locator('#voice-needs')).toHaveCount(0);
  // Let the known short audio fixture play into the real MediaRecorder.
  await page.waitForTimeout(2000);
  const start = performance.now();
  await needs.getByRole('button', { name: /^Stop microphone:/ }).click();
  await expect(needs.getByText('Turning your speech into text…', { exact: true })).toBeVisible();
  await expect(page.locator('#voice-needs')).toHaveValue(/option\s+(one|1)/i, { timeout: 50000 });
  expect(await page.evaluate(() => (window as unknown as { capturedStream: MediaStream }).capturedStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
  await needs.getByRole('button', { name: 'Use this answer', exact: true }).click();
  await expect(needs.getByRole('checkbox').first()).toBeChecked();
  testInfo.annotations.push({ type: 'timing', description: `Real recording to live transcription: ${Math.round(performance.now() - start)}ms` });
});
test('24 failed transcription shows one error without an empty review box', async ({ page }) => {
  await speech(page);
  await page.route('**/api/transcribe', route => route.fulfill({ status: 502, json: { error: 'Demo transcription connection error.' } }));
  await page.goto('/intake');
  const needs = field(page, 'needs');
  await needs.getByRole('button', { name: /^Speak answer:/ }).click();
  await emit(page, 'option one');
  await needs.getByRole('button', { name: /^Stop microphone:/ }).click();
  await expect(needs.getByRole('alert')).toHaveText('Demo transcription connection error.');
  await expect(page.locator('#voice-needs')).toHaveCount(0);
  await expect(needs.getByRole('button', { name: 'Use this answer', exact: true })).toHaveCount(0);
  await needs.getByRole('checkbox').first().check();
});
test('25 cancelled transcription never fills or selects an answer later', async ({ page }) => {
  await speech(page);
  await page.route('**/api/transcribe', async route => { await delay(300); await route.fulfill({ json: { text: 'option one' } }); });
  await page.goto('/intake');
  const needs = field(page, 'needs');
  await needs.getByRole('button', { name: /^Speak answer:/ }).click();
  await emit(page, 'option one');
  await needs.getByRole('button', { name: /^Stop microphone:/ }).click();
  await needs.getByRole('button', { name: 'Cancel voice answer', exact: true }).click();
  await delay(400);
  await expect(page.locator('#voice-needs')).toHaveCount(0);
  await expect(needs.getByRole('checkbox', { checked: true })).toHaveCount(0);
  await expect(needs.getByRole('button', { name: /^Speak answer:/ })).toBeEnabled();
});
test('26 cancelled permission prompts release a stream that arrives late', async ({ page }) => {
  await speech(page);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise(resolve => {
      const w = window as unknown as { resolveMicrophone: () => void; lateStopped: boolean };
      w.lateStopped = false;
      w.resolveMicrophone = () => resolve({ getTracks: () => [{ stop: () => { w.lateStopped = true; } }] } as unknown as MediaStream);
    });
  });
  await page.goto('/intake');
  const needs = field(page, 'needs');
  await needs.getByRole('button', { name: /^Speak answer:/ }).click();
  await needs.getByRole('button', { name: /^Cancel microphone:/ }).click();
  await page.evaluate(() => (window as unknown as { resolveMicrophone: () => void }).resolveMicrophone());
  await expect.poll(() => page.evaluate(() => (window as unknown as { lateStopped: boolean }).lateStopped)).toBe(true);
  await expect(needs.getByRole('button', { name: /^Speak answer:/ })).toBeEnabled();
});

test('27 longest path has seven questions and keeps personal choices in the API', async ({ page }) => {
  const server = await api(page);
  await page.goto('/intake');
  for (const index of [0, 3, 4]) await field(page, 'needs').getByRole('checkbox').nth(index).check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await field(page, 'walking').getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await field(page, 'communication_supports').getByRole('checkbox').nth(1).check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Accessible restroom', exact: true }).getByRole('radio', { name: 'Must have', exact: true }).check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await field(page, 'interests').getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await field(page, 'pace').getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Step 7 of 7', { exact: true })).toBeVisible();
  await page.locator('#start_date').fill('2030-10-22');
  await page.locator('#end_date').fill('2030-10-25');
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Plan my trip', exact: true })).toBeVisible();
  const answers = server.bodies['POST /api/intake'][0].answers as Record<string, { selected: string[] }>;
  expect(Object.keys(answers)).toHaveLength(9);
  expect(answers.requirements.selected).toEqual(['accessible_restroom']);
  expect(answers.communication_supports.selected).toEqual(['asl_interpretation']);
  expect(answers).not.toHaveProperty('standing');
  expect(answers).not.toHaveProperty('companion_can_push');
});

test('28 old questionnaire drafts restart at step one and keep personal answers', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('limitless_intake_00000000-0000-4000-8000-0000000000e1', JSON.stringify({
    answers: { needs: ['mobility_device'], walking: 'cannot_walk' }, others: {}, index: 1,
  })));
  await page.goto('/intake');
  await expect(page.getByText('Step 1 of 6', { exact: true })).toBeVisible();
  await expect(field(page, 'needs').getByRole('checkbox').first()).toBeChecked();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(field(page, 'walking').getByRole('radio').first()).toBeChecked();
});

test('29 top navigation opens the separate dashboard with saved trip actions', async ({ page }) => {
  await api(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'My trips', exact: true }).click();
  await expect(page).toHaveURL(/\/my-trips$/);
  await expect(page.getByRole('heading', { name: 'My trips', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open itinerary', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit with AI', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit manually', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('30 manual edits save and restore after a page reload', async ({ page }) => {
  const server = await api(page);
  await page.goto('/my-trips');
  await page.getByRole('link', { name: 'Edit manually', exact: true }).click();
  const form = page.locator('#manual-editor form').first();
  await form.getByRole('combobox', { name: 'Stop status' }).selectOption('skipped');
  await form.getByRole('textbox', { name: 'Personal note' }).fill('Demo reminder: bring a camera.');
  await form.getByRole('checkbox', { name: 'Keep this stop during AI re-planning' }).check();
  await form.getByRole('button', { name: 'Save stop', exact: true }).click();
  await expect(page.locator('#manual-editor').getByRole('status')).toContainText('is saved.');
  await page.reload();
  await expect(form.getByRole('combobox', { name: 'Stop status' })).toHaveValue('skipped');
  await expect(form.getByRole('textbox', { name: 'Personal note' })).toHaveValue('Demo reminder: bring a camera.');
  await expect(form.getByRole('checkbox')).toBeChecked();
  await form.getByRole('combobox').selectOption('planned');
  await form.getByRole('button', { name: 'Save stop', exact: true }).click();
  await expect(page.locator('#manual-editor').getByRole('status')).toContainText('is saved.');
  expect(Object.entries(server.counts).filter(([key]) => key.startsWith('PATCH /api/trips/')).reduce((n, [, count]) => n + count, 0)).toBe(2);
});

test('31 edit with AI opens the saved itinerary feedback dialog', async ({ page }) => {
  await api(page);
  await page.goto('/my-trips');
  await page.getByRole('link', { name: 'Edit with AI', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#tell-text')).toBeFocused();
});

test('32 rapid repeated manual save sends one update', async ({ page }) => {
  const server = await api(page, { delay: 150 });
  await page.goto('/my-trips');
  await page.getByRole('link', { name: 'Edit manually', exact: true }).click();
  const form = page.locator('#manual-editor form').first();
  await form.getByRole('textbox', { name: 'Personal note' }).fill('Demo: meet at the entrance.');
  await form.evaluate(element => { (element as HTMLFormElement).requestSubmit(); (element as HTMLFormElement).requestSubmit(); });
  await expect(page.locator('#manual-editor').getByRole('status')).toContainText('is saved.');
  expect(Object.entries(server.counts).filter(([key]) => key.startsWith('PATCH /api/trips/')).reduce((n, [, count]) => n + count, 0)).toBe(1);
});

const pathCases = [
  { name: 'interests only', needs: ['other'] },
  { name: 'wheelchair and beach interest', needs: ['mobility_device'] },
  { name: 'limited walking and varied pace', needs: ['limited_mobility'] },
  { name: 'temporary injury', needs: ['temporary_injury'] },
  { name: 'Deaf traveler', needs: ['deaf_hoh'] },
  { name: 'non-speaking traveler', needs: ['non_speaking'] },
  { name: 'combined mobility hearing communication and service animal', needs: ['mobility_device', 'deaf_hoh', 'non_speaking', 'service_animal'] },
  { name: 'service animal without a mobility assumption', needs: ['service_animal'] },
];
for (const [caseIndex, scenario] of pathCases.entries()) {
  test(`complete questionnaire: ${scenario.name}`, async ({ page }) => {
    const server = await api(page);
    await page.goto('/intake');
    const expected: Record<string, string[]> = {};
    const screens = intakeScreens.filter(screen => screen.questions.some(q => isVisible(q, { needs: scenario.needs })));
    for (const [index, screen] of screens.entries()) {
      const q = screen.questions[0];
      await expect(page.locator('[data-question-id]')).toHaveCount(1);
      const options = q.options ?? [];
      const more = page.getByRole('button', { name: 'More options', exact: true });
      if (await more.count()) await more.click();
      const group = field(page, q.id);
      if (q.inputType === 'date') {
        await page.locator('#start_date').fill('2030-10-22');
  await page.locator('#end_date').fill('2030-10-25');
        expected[q.id] = [];
      } else if (q.inputType === 'must-nice') {
        const option = options[caseIndex % options.length];
        await group.getByRole('radiogroup', { name: option.label, exact: true }).getByRole('radio', { name: 'Must have', exact: true }).check();
        expected[q.id] = [option.value];
      } else {
        const selected = q.id === 'needs' ? scenario.needs : [options[caseIndex % options.length].value];
        for (const value of selected) await group.getByRole(q.inputType === 'multi' ? 'checkbox' : 'radio').nth(options.findIndex(option => option.value === value)).check();
        expected[q.id] = selected;
      }
      if (q.id === 'interests') await page.locator('#interests-other').fill(`Demo personal preference ${caseIndex}: quiet lunch & café <nearby>.`);
      await page.getByRole('button', { name: index === screens.length - 1 ? 'Finish' : 'Next', exact: true }).click();
    }
    await expect(page.getByRole('button', { name: 'Plan my trip', exact: true })).toBeVisible();
    const answers = server.bodies['POST /api/intake'][0].answers as Record<string, { selected: string[]; other: string }>;
    for (const [id, values] of Object.entries(expected)) expect(answers[id].selected).toEqual(values);
    expect((answers.start_date as unknown as { freeform: string }).freeform).toBe('2030-10-22');
    expect(answers.interests.other).toBe(`Demo personal preference ${caseIndex}: quiet lunch & café <nearby>.`);
    expect(answers).not.toHaveProperty('equipment');
    if (!scenario.needs.some(need => ['mobility_device', 'limited_mobility', 'temporary_injury'].includes(need))) expect(answers).not.toHaveProperty('walking');
    if (!scenario.needs.some(need => ['deaf_hoh', 'non_speaking'].includes(need))) expect(answers).not.toHaveProperty('communication_supports');
  });
}

test('voice review refuses a reversed preference and typed correction applies once', async ({ page }) => {
  await speech(page);
  await seed(page, { ...baseAnswers, interests: ['history'] }, 2);
  const interests = field(page, 'interests');
  await interests.getByRole('button', { name: /^Speak answer:/ }).click();
  await emit(page, 'I hate beaches');
  await interests.getByRole('button', { name: /^Stop microphone:/ }).click();
  await expect(page.locator('#voice-interests')).toHaveValue('I hate beaches');
  await expect(interests.getByRole('button', { name: 'Use this answer', exact: true })).toBeDisabled();
  await expect(interests.getByRole('checkbox', { name: /History$/ })).toBeChecked();
  await expect(interests.getByRole('checkbox').first()).not.toBeChecked();
  await page.locator('#voice-interests').fill('I love beaches');
  await interests.getByRole('button', { name: 'Use this answer', exact: true }).click();
  await expect(interests.getByRole('checkbox').first()).toBeChecked();
  await interests.getByRole('button', { name: 'More options', exact: true }).click();
  await expect(interests.getByRole('checkbox', { name: /History$/ })).not.toBeChecked();
  await expect(interests.getByRole('button', { name: 'Use this answer', exact: true })).toBeDisabled();
});

test('unsupported voice recording keeps normal questionnaire choices available', async ({ page }) => {
  await speech(page, false);
  await page.goto('/intake');
  await expect(field(page, 'needs').getByRole('button', { name: /^Speak answer:/ })).toBeDisabled();
  await field(page, 'needs').getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(field(page, 'walking')).toBeVisible();
});

test('demo access list is short and selected extras remain visible', async ({ page }) => {
  await page.goto('/intake');
  await page.waitForFunction(() => localStorage.getItem('limitless_intake_00000000-0000-4000-8000-0000000000e1') !== null);
  await page.evaluate(answers => localStorage.setItem('limitless_intake_00000000-0000-4000-8000-0000000000e1', JSON.stringify({ version: 4, answers, others: {}, index: 1 })), baseAnswers);
  await page.reload();
  const requirements = field(page, 'requirements');
  await expect(requirements.getByRole('radiogroup')).toHaveCount(6);
  await requirements.getByRole('button', { name: 'More options', exact: true }).click();
  await expect(requirements.getByRole('radiogroup')).toHaveCount(10);
  const rental = requirements.getByRole('radiogroup', { name: 'Wheelchair or scooter rental', exact: true });
  await rental.getByRole('radio', { name: 'Must have', exact: true }).check();
  await requirements.getByRole('button', { name: 'Fewer options', exact: true }).click();
  await expect(rental.getByRole('radio', { name: 'Must have', exact: true })).toBeChecked();
  await page.reload();
  await expect(rental.getByRole('radio', { name: 'Must have', exact: true })).toBeChecked();
});

test('calendar rejects past dates and passes the chosen date directly into trip creation', async ({ page }) => {
  const server = await api(page);
  await seed(page, { ...baseAnswers, start_date: '2020-01-01' } as typeof baseAnswers);
  await expect(page.locator('#start_date')).toHaveAttribute('type', 'date');
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.locator('#start_date-error')).toBeVisible();
  await page.locator('#start_date').fill('2030-10-22');
  await page.locator('#end_date').fill('2030-10-25');
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await page.getByRole('button', { name: 'Plan my trip', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your San Diego trip', exact: true })).toBeVisible();
  expect(server.bodies['POST /api/trips'][0].start_date).toBe('2030-10-22');
  expect(server.bodies['POST /api/trips'][0].nights).toBe(3);
  const answers = server.bodies['POST /api/intake'][0].answers as Record<string, { freeform: string }>;
  expect(answers.start_date.freeform).toBe('2030-10-22');
  expect(answers.end_date.freeform).toBe('2030-10-25');
  expect(answers.nights.freeform).toBe('3');
});


test('calendar requires a complete ordered range and keeps both dates on reload', async ({ page }) => {
  await page.goto('/intake');
  await page.waitForFunction(() => localStorage.getItem('limitless_intake_00000000-0000-4000-8000-0000000000e1') !== null);
  await page.evaluate(answers => localStorage.setItem('limitless_intake_00000000-0000-4000-8000-0000000000e1', JSON.stringify({ version: 4, answers, others: {}, index: 4 })), baseAnswers);
  await page.reload();
  await page.getByLabel('Start date', { exact: true }).fill('2030-10-22');
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Choose both dates' })).toBeVisible();
  await page.getByLabel('End date (return)', { exact: true }).fill('2030-10-21');
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'End date must be after' })).toBeVisible();
  await page.getByLabel('End date (return)', { exact: true }).fill('2030-10-25');
  await page.reload();
  await expect(page.getByLabel('Start date', { exact: true })).toHaveValue('2030-10-22');
  await expect(page.getByLabel('End date (return)', { exact: true })).toHaveValue('2030-10-25');
});

test('end date accepts reviewed voice input without adding a question', async ({ page }) => {
  const server = await api(page);
  await speech(page);
  await seed(page);
  await page.getByLabel('Start date', { exact: true }).fill('2030-10-22');
  await expect(page.getByRole('button', { name: 'Speak answer: Start date', exact: true })).toHaveText('Speak start date');
  await expect(page.getByRole('button', { name: 'Speak answer: End date', exact: true })).toHaveText('Speak end date');
  await page.getByRole('button', { name: 'Speak answer: End date', exact: true }).click();
  await emit(page, 'October 25, 2030');
  await page.getByRole('button', { name: 'Stop microphone: End date', exact: true }).click();
  await expect(page.locator('#voice-end_date')).toHaveValue('October 25, 2030');
  await page.getByRole('button', { name: 'Use this answer', exact: true }).click();
  await expect(page.getByLabel('End date (return)', { exact: true })).toHaveValue('2030-10-25');
  await expect(page.locator('[data-question-id]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Plan my trip', exact: true })).toBeVisible();
  const answers = server.bodies['POST /api/intake'][0].answers as Record<string, { freeform: string }>;
  expect(answers.end_date.freeform).toBe('2030-10-25');
  expect(answers.nights.freeform).toBe('3');
});

test('older avoidances and transport remain editable notes in the shorter demo', async ({ page }) => {
  await page.goto('/intake');
  await page.waitForFunction(() => localStorage.getItem('limitless_intake_00000000-0000-4000-8000-0000000000e1') !== null);
  await page.evaluate(() => localStorage.setItem('limitless_intake_00000000-0000-4000-8000-0000000000e1', JSON.stringify({
    version: 3, answers: { needs: ['other'], avoid: ['crowds', 'hills'], transport: 'transit' }, others: { requirements: 'Demo: need extra space.' }, index: 5,
  })));
  await page.reload();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('#requirements-other')).toHaveValue('Demo: need extra space. Please avoid: Crowds, Hills. Getting around: Public transit.');
  await page.reload();
  await expect(page.locator('#requirements-other')).toHaveValue('Demo: need extra space. Please avoid: Crowds, Hills. Getting around: Public transit.');
});

test('trip deletion requires confirmation and stays deleted after reload', async ({ page }) => {
  const server = await api(page, { delay: 100 });
  await page.goto('/my-trips');
  await page.getByRole('button', { name: 'Delete trip', exact: true }).click();
  const confirm = page.getByRole('group', { name: 'Confirm trip deletion' });
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(server.counts[`DELETE /api/trips/${trip.id}`] ?? 0).toBe(0);
  await page.getByRole('button', { name: 'Delete trip', exact: true }).click();
  await confirm.getByRole('button', { name: 'Delete', exact: true }).dblclick();
  await expect(page.getByRole('heading', { name: 'No trips yet' })).toBeVisible();
  expect(server.counts[`DELETE /api/trips/${trip.id}`]).toBe(1);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'No trips yet' })).toBeVisible();
});

test('AI dictation appends to typed requests and can be recorded twice', async ({ page }) => {
  const server = await api(page);
  await speech(page);
  await page.goto(`${tripUrl}?edit=ai`);
  const dialog = page.getByRole('dialog');
  await dialog.locator('#tell-text').fill('Demo: more museums.');
  for (const words of ['Less walking.', 'More breaks.']) {
    await dialog.getByRole('button', { name: 'Speak', exact: true }).click();
    await emit(page, words);
    await dialog.getByRole('button', { name: 'Stop recording', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Update my plan', exact: true })).toBeEnabled();
  }
  await expect(dialog.locator('#tell-text')).toHaveValue('Demo: more museums. Less walking. More breaks.');
  await dialog.getByRole('button', { name: 'Update my plan', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Save changes', exact: true })).toBeVisible();
  expect(server.bodies[`POST /api/trips/${trip.id}/feedback`][0]).toMatchObject({ transcript: 'Demo: more museums. Less walking. More breaks.', input_mode: 'voice' });
  await dialog.getByRole('button', { name: 'Change request', exact: true }).click();
  await expect(dialog.locator('#tell-text')).toHaveValue('Demo: more museums. Less walking. More breaks.');
});

test('AI microphone denial keeps the typed request usable', async ({ page }) => {
  await api(page); await speech(page);
  await page.goto(`${tripUrl}?edit=ai`);
  await page.evaluate(() => { (window as unknown as { denyMicrophone: boolean }).denyMicrophone = true; });
  const dialog = page.getByRole('dialog');
  await dialog.locator('#tell-text').fill('Demo: try different stops.');
  await dialog.getByRole('button', { name: 'Speak', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Microphone access is off');
  await expect(dialog.locator('#tell-text')).toHaveValue('Demo: try different stops.');
  await dialog.getByRole('button', { name: 'Update my plan', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Save changes', exact: true })).toBeVisible();
});

test('itinerary has one top back control and a clean summary', async ({ page }) => {
  await api(page); await page.goto(tripUrl);
  await expect(page.getByRole('heading', { name: 'Your San Diego trip', exact: true })).toBeVisible();
  const back = page.getByRole('link', { name: 'Back to My trips', exact: true });
  await expect(back).toHaveCount(1);
  await expect(page.getByText('Demo trip — accessibility facts are demo data, not verified.', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Demo data scores low/)).toHaveCount(0);
  await back.click();
  await expect(page).toHaveURL(/\/my-trips$/);
});
