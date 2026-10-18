import assert from 'node:assert/strict';
import { test } from 'node:test';
import { questionCatalog, intakeScreens } from '../lib/intakeQuestions.ts';
import { parseVoiceAnswer } from '../lib/questionnaire-voice.ts';
const questions = intakeScreens.flatMap(screen => screen.questions);
const cases = [
  ['interests', 'I hate beaches', null],
  ['interests', 'I dislike museums', null],
  ['interests', 'I avoid nightlife', null],
  ['pace', 'I dislike busy', null],
  ['transport', 'I avoid public transit', null],
  ['needs', 'I hate wheelchair', null],
  ['avoid', 'I enjoy crowds', null],
  ['avoid', 'I love hills', null],
  ['avoid', 'I like noise', null],
  ['avoid', 'I prefer to avoid crowds', ['crowds']],
  ['avoid', 'I hate hills and crowds', ['crowds', 'hills']],
  ['interests', 'I love beaches', ['beaches']],
  ['interests', 'museums and beaches', ['beaches', 'museums_art']],
  ['needs', 'I use a wheelchair', ['mobility_device']],
  ['needs', 'I am deaf', ['deaf_hoh']],
  ['needs', 'I am not deaf', null],
  ['needs', 'deaf or wheelchair', null],
  ['needs', 'I am deaf and hungry', null],
  ['pace', 'relaxed or busy', null],
  ['interests', 'option zero', null],
  ['interests', 'option ninety nine', null],
  ['interests', 'option one and option one', ['beaches']],
  ['communication_supports', 'option two and option five', ['asl_interpretation', 'aac_device']],
  ['communication_supports', 'no captions', null],
  ['avoid', '  ', null],
  ['needs', 'x'.repeat(2001), null],
];
for (const [id, speech, expected] of cases) {
  test(`voice edge: ${id}: ${speech.length > 60 ? 'oversized input' : speech}`, () => {
    const parsed = parseVoiceAnswer((questions.find(q => q.id === id) ?? questionCatalog.flatMap(screen => screen.questions).find(q => q.id === id)), speech);
    if (expected === null) assert.ok('error' in parsed, JSON.stringify(parsed));
    else assert.deepEqual(parsed.value, expected);
  });
}
