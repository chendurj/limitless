import assert from 'node:assert/strict';
import { test } from 'node:test';
import { intakeScreens, deferredScreens, visibleScreens } from '../lib/intakeQuestions.ts';
import { parseVoiceAnswer } from '../lib/questionnaire-voice.ts';
const questions = [...intakeScreens, ...deferredScreens].flatMap(screen => screen.questions);
const q = id => questions.find(question => question.id === id);

for (const screen of [...intakeScreens, ...deferredScreens]) {
  test(`every question on "${screen.title}" accepts a reviewed voice answer`, () => {
    for (const question of screen.questions) {
      const answer = question.inputType === 'date' ? 'October 22, 2026'
        : question.inputType === 'number' ? 'two'
        : question.inputType === 'text' ? 'Downtown San Diego'
        : question.inputType === 'must-nice' ? 'option one must have'
        : 'option one';
      const parsed = parseVoiceAnswer(question, answer);
      assert.ok('value' in parsed, `${question.id}: ${JSON.stringify(parsed)}`);
      assert.ok(parsed.summary);
    }
  });
}

test('all nine screens in the mobility questionnaire are covered', () => {
  const screens = visibleScreens({ needs: ['mobility_device'] });
  assert.equal(screens.length, 9);
  assert.ok(screens.every(screen => screen.questions.length));
});
test('reads option labels and multiple explicit option numbers', () => {
  assert.deepEqual(parseVoiceAnswer(q('interests'), 'Beaches and zoos and aquariums').value, ['beaches', 'zoos_aquariums']);
  assert.deepEqual(parseVoiceAnswer(q('needs'), 'option one and option four').value, ['mobility_device', 'deaf_hoh']);
  assert.deepEqual(parseVoiceAnswer(q('needs'), 'option one, option four').value, ['mobility_device', 'deaf_hoh']);
  assert.equal(parseVoiceAnswer(q('equipment'), 'Manual wheelchair').value[0], 'manual_wheelchair');
  assert.equal(parseVoiceAnswer(q('companion_can_push'), 'Yes, but only light help').value, 'light_only');
});
test('rejects ambiguity, negation, unsupported words, and out-of-range options', () => {
  for (const [id, text] of [['stairs', 'option one and option two'], ['needs', 'not temporary injury'], ['interests', 'beaches or history'], ['interests', 'beaches and flying'], ['equipment', 'option twenty'], ['equipment', 'option zero']]) {
    assert.ok('error' in parseVoiceAnswer(q(id), text), text);
  }
});
test('must-have levels are explicit and preserve unrelated existing needs', () => {
  const current = { must: ['step_free_entrance'], nice: ['accessible_restroom'] };
  const parsed = parseVoiceAnswer(q('requirements'), 'option two must have, option five nice to have', current);
  assert.deepEqual(parsed.value, { must: ['step_free_entrance', 'accessible_restroom'], nice: ['elevator'] });
  assert.deepEqual(current, { must: ['step_free_entrance'], nice: ['accessible_restroom'] });
  assert.ok('error' in parseVoiceAnswer(q('requirements'), 'accessible restroom'));
  assert.ok('error' in parseVoiceAnswer(q('requirements'), 'option two must have, option two nice to have'));
  assert.deepEqual(parseVoiceAnswer(q('requirements'), 'option two not needed', current).value, { must: ['step_free_entrance'], nice: [] });
});
test('normalizes whole numbers without accepting negative or fractional answers', () => {
  assert.equal(parseVoiceAnswer(q('nights'), 'twenty one').value, '21');
  assert.equal(parseVoiceAnswer(q('party_size'), '2').value, '2');
  for (const text of ['-2', '2.5', 'minus two', 'a few', '9007199254740992']) assert.ok('error' in parseVoiceAnswer(q('nights'), text));
});
test('requires full valid dates and does not guess missing years', () => {
  assert.equal(parseVoiceAnswer(q('start_date'), 'October 22nd, 2026').value, '2026-10-22');
  assert.equal(parseVoiceAnswer(q('start_date'), '2028-02-29').value, '2028-02-29');
  for (const text of ['October 22', 'tomorrow', 'February 30, 2026', '2026-02-29', '2026-13-01']) assert.ok('error' in parseVoiceAnswer(q('start_date'), text));
});
test('free text stays as spoken and oversized/empty input is rejected', () => {
  assert.equal(parseVoiceAnswer(q('lodging_area'), 'Little Italy').value, 'Little Italy');
  assert.ok('error' in parseVoiceAnswer(q('lodging_area'), ' '));
  assert.ok('error' in parseVoiceAnswer(q('lodging_area'), 'x'.repeat(2001)));
});
