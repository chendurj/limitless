import assert from 'node:assert/strict';
import { test } from 'node:test';
import { questionCatalog, intakeScreens, deferredScreens, visibleScreens, isVisible } from '../lib/intakeQuestions.ts';
import { parseVoiceAnswer } from '../lib/questionnaire-voice.ts';
const questions = [...intakeScreens, ...deferredScreens].flatMap(screen => screen.questions);
const q = id => questions.find(question => question.id === id) ?? questionCatalog.flatMap(screen => screen.questions).find(question => question.id === id);

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

test('every combination stays within seven actual questions and one per step', () => {
  const needs = ['mobility_device', 'limited_mobility', 'temporary_injury', 'deaf_hoh', 'non_speaking', 'service_animal', 'other'];
  for (let mask = 0; mask < 128; mask++) {
    const answers = { needs: needs.filter((_, i) => mask & (1 << i)) };
    const screens = visibleScreens(answers);
    assert.ok(screens.length >= 5 && screens.length <= 7);
    assert.ok(screens.every(screen => screen.questions.filter(q => isVisible(q, answers)).length === 1));
  }
});
test('explicit must-haves and preferences remain separate', () => {
  const current = { must: ['step_free_entrance'], nice: ['accessible_restroom'] };
  const parsed = parseVoiceAnswer(q('requirements'), 'option two must have, option six nice to have', current);
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

test("natural phrases select the one option they clearly name", () => {
  const cases = [
    ["needs", "I am deaf.", ["deaf_hoh"]],
    ["needs", "I'm Deaf and I use a wheelchair", null],
    ["needs", "I have a temporary injury", null],
    ["interests", "beaches and museums", null],
    ["avoid", "I hate hills and crowds", null],
    ["needs", "I'm deaf or hard of hearing", null],
  ];
  for (const [id, said] of cases) {
    const parsed = parseVoiceAnswer(q(id), said);
    assert.ok("value" in parsed, `${id} "${said}": ${JSON.stringify(parsed)}`);
  }
  const deaf = parseVoiceAnswer(q("needs"), "I am deaf.");
  assert.deepEqual(deaf.value, [q("needs").options.find(o => /deaf/i.test(o.label)).value]);
  const both = parseVoiceAnswer(q("needs"), "I'm Deaf and I use a wheelchair");
  assert.equal(both.value.length, 2);
  const avoid = parseVoiceAnswer(q("avoid"), "I hate hills and crowds");
  assert.deepEqual(new Set(avoid.summary.split(", ")), new Set(["Crowds", "Hills"]));
});

test("negations and unclear words are never guessed", () => {
  for (const said of ["I am not deaf", "no wheelchair", "never mind", "pizza", "deaf or wheelchair", "I am deaf and hungry"]) {
    assert.ok("error" in parseVoiceAnswer(q("needs"), said), said);
  }
  // A single-choice question still needs exactly one option.
  assert.ok("error" in parseVoiceAnswer(q("pace"), "relaxed or busy"));
  assert.ok("value" in parseVoiceAnswer(q("pace"), "something relaxed please"));
});

test("a single-choice answer can use natural speech around the option", () => {
  const busy = parseVoiceAnswer(q("pace"), "I am a very busy person. I like to go on a lot of places.");
  assert.equal(busy.value, "busy");
  assert.ok("error" in parseVoiceAnswer(q("pace"), "I am not a busy person"));
  assert.ok("error" in parseVoiceAnswer(q("pace"), "relaxed or busy, I am not sure"));
  assert.ok("error" in parseVoiceAnswer(q("pace"), "I like to travel with my family"));
});
