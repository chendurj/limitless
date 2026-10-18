import { test, expect, type Page } from '@playwright/test';
import tripFixture from '../../fixtures/trip_ankle.json';
import { intakeScreens, isVisible } from '../../lib/intakeQuestions';

const baseAnswers = { needs: ['other'], party: 'alone', interests: ['beaches'], transport: 'personal_car', pace: 'relaxed' };
const trip = structuredClone(tripFixture);
const tripUrl = `/trips/${trip.id}`;
const intakeResult = { profile_id: 'demo-profile', dna: { summary: 'Demo access needs for testing.' }, followups: [], assumptions: [] };
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page) ?? [], 'No uncaught browser exceptions').toEqual([]);
});
async function seed(page: Page, answers = baseAnswers, index = 5, others = {}) {
  await page.addInitScript(saved => localStorage.setItem('limitless_intake', JSON.stringify(saved)), { answers, others, index });
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
    if (path.endsWith('/followups')) return route.fulfill({ json: intakeResult });
    if (path.startsWith('/api/profiles/')) return route.fulfill({ json: {} });
    if (path.endsWith('/feedback')) return route.fulfill({ json: { replan: { changed: true, version: 2, message: 'Demo rest added.', changes: [{ type: 'rest_added', day_index: 0, reason: 'Demo extra break.' }] } } });
    if (path.endsWith('/replan')) return route.fulfill({ json: { trip: { ...trip, version: 2 }, message: 'Demo plan restored.' } });
    if (path.includes('/items/')) {
      const item = trip.days.flatMap(day => day.items).find(item => path.endsWith(item.id))!;
      return route.fulfill({ json: { ...item, ...request.postDataJSON() } });
    }
    if (path.startsWith('/api/trips')) return route.fulfill({ json: trip });
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
    await page.evaluate(saved => localStorage.setItem('limitless_intake', JSON.stringify(saved)), { answers, others: {}, index });
    await page.reload();
    await expect(page.getByRole('heading', { name: screen.title, exact: true })).toBeVisible();
    for (const question of screen.questions.filter(q => isVisible(q, answers))) {
      const values = question.options?.map(option => option.value) ?? [];
      const labels = question.options?.map(option => option.label.toLowerCase()) ?? [];
      expect(new Set(values).size).toBe(values.length);
      expect(new Set(labels).size).toBe(labels.length);
      const container = field(page, question.id);
      await expect(container.getByRole('button', { name: /^Speak answer:/ })).toHaveCount(1);
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
  await field(page, 'equipment').getByRole('checkbox').first().check();
  await field(page, 'walking').getByRole('radio').first().check();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Getting around', exact: true })).toBeVisible();
  await expect(field(page, 'equipment').getByRole('checkbox').first()).toBeChecked();
  await expect(field(page, 'walking').getByRole('radio').first()).toBeChecked();
});
test('08 corrupt saved JSON does not break the questionnaire', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('limitless_intake', '{broken'));
  await page.goto('/intake');
  await expect(page.getByRole('heading', { name: 'What should we plan around?', exact: true })).toBeVisible();
});
test('09 malformed saved answer shapes and step numbers are discarded safely', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('limitless_intake', JSON.stringify({ answers: { needs: { bad: true } }, others: 42, index: -100 })));
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
  expect(answers.cuisines?.other).toBe('Demo gluten-free preference');
  expect(answers.requirements?.other).toBe('Demo extra requirement');
});
test('12 party size rejects zero and fractional numbers before advancing', async ({ page }) => {
  await seed(page, { ...baseAnswers, party: 'family' }, 1);
  await page.locator('#party_size').fill('0');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: "Who's with you", exact: true })).toBeVisible();
  await page.locator('#party_size').fill('1.5');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: "Who's with you", exact: true })).toBeVisible();
});
test('13 must-have and nice-to-have selections remain mutually exclusive', async ({ page }) => {
  await seed(page, baseAnswers, 2);
  const group = page.getByRole('radiogroup', { name: 'Accessible restroom', exact: true });
  await group.getByRole('radio', { name: 'Must have', exact: true }).check();
  await group.getByRole('radio', { name: 'Nice to have', exact: true }).check();
  await expect(group.getByRole('radio', { checked: true })).toHaveCount(1);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('limitless_intake')!));
  expect(saved.answers.requirements).toEqual({ must: [], nice: ['accessible_restroom'] });
  await expect(page.locator('#requirements-other')).toBeVisible();
});
test('14 switching microphones cancels the previous field and errors keep manual choices usable', async ({ page }) => {
  await speech(page); await seed(page, { ...baseAnswers, needs: ['mobility_device'] }, 1);
  await field(page, 'equipment').getByRole('button', { name: /^Speak answer:/ }).click();
  await field(page, 'walking').getByRole('button', { name: /^Speak answer:/ }).click();
  expect(await page.evaluate(() => (window as unknown as { recognitions: { aborted: boolean }[] }).recognitions.at(-2)!.aborted)).toBe(true);
  await field(page, 'walking').getByRole('button', { name: 'Cancel voice answer', exact: true }).click();
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
  await page.getByRole('button', { name: /Tell Limitless how/ }).click();
  await page.locator('#tell-text').fill('Demo: I need a break.');
  await page.getByRole('button', { name: 'Send', exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
  expect(server.counts[`POST /api/trips/${trip.id}/feedback`]).toBe(1);
  expect(server.counts[`POST /api/trips/${trip.id}/replan`]).toBe(2);
});
test('20 cancelling in-flight feedback does not overwrite the next conversation', async ({ page }) => {
  await api(page, { delay: 500 }); await page.goto(tripUrl);
  await page.getByRole('button', { name: /Tell Limitless how/ }).click();
  await page.locator('#tell-text').fill('Demo old feedback.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: /Tell Limitless how/ }).click();
  await page.locator('#tell-text').fill('Demo new feedback.');
  await delay(700);
  await expect(page.locator('#tell-text')).toHaveValue('Demo new feedback.');
  await expect(page.getByRole('dialog').getByText('Demo rest added.', { exact: true })).toHaveCount(0);
});
test('21 warm local questionnaire navigation responds within one second', async ({ page }, testInfo) => {
  await page.goto('/intake'); await field(page, 'needs').getByRole('checkbox').first().check();
  const start = performance.now();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Getting around', exact: true })).toBeVisible();
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
