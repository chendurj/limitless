import assert from 'node:assert/strict';
import { test } from 'node:test';
import { intakeScreens, deferredScreens, visibleScreens, isVisible } from '../lib/intakeQuestions.ts';
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

test('every combination stays within eight actual questions and one per step', () => {
  const needs = ['mobility_device', 'limited_mobility', 'temporary_injury', 'deaf_hoh', 'non_speaking', 'service_animal', 'other'];
  for (let mask = 0; mask < 128; mask++) {
    const answers = { needs: needs.filter((_, i) => mask & (1 << i)) };
    const screens = visibleScreens(answers);
    assert.ok(screens.length >= 6 && screens.length <= 8);
    assert.ok(screens.every(screen => screen.questions.filter(q => isVisible(q, answers)).length === 1));
  }
});
test('explicit must-haves and preferences remain separate', () => {
  const current = { must: ['step_free_entrance'], nice: ['accessible_restroom'] };
  const parsed = parseVoiceAnswer(q('requirements'), 'option two must have, option five nice to have', current);
  assert.deepEqual(parsed.value, { must: ['step_free_entrance', 'accessible_restroom'], nice: ['elevator'] });
  assert.ok('error' in parseVoiceAnswer(q('requirements'), 'accessible restroom'));
});
test('supports reviewed personal text and multiple interests', () => {
  assert.deepEqual(parseVoiceAnswer(q('interests'), 'Beaches and zoos and aquariums').value, ['beaches', 'zoos_aquariums']);
  assert.deepEqual(parseVoiceAnswer(q('needs'), 'option one and option four').value, ['mobility_device', 'deaf_hoh']);
  for (const [id, text] of [['pace', 'option one and option two'], ['needs', 'not temporary injury'], ['interests', 'beaches or history'], ['interests', 'beaches and flying'], ['walking', 'option twenty']]) {
    assert.ok('error' in parseVoiceAnswer(q(id), text));
  }
});
