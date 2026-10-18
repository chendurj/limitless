import type { IntakeQuestion } from "./intakeQuestions";
import type { FieldValue, MustNice } from "../components/QuestionField";

type ParsedAnswer = { value: FieldValue; summary: string } | { error: string };
const smallNumbers = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const tens: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

function words(text: string) {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[’']/g, "").replace(/\bim\b/g, "i am").replace(/\bcant\b/g, "cannot")
    .replace(/\bdont\b/g, "do not").replace(/[^a-z0-9]+/g, " ").trim();
}

function number(text: string): number | null {
  if (/^[+-]\d|^\d*[.,]\d/.test(text.trim())) return null;
  const clean = words(text);
  if (/^\d+$/.test(clean)) return Number(clean);
  const units = smallNumbers.indexOf(clean);
  if (units >= 0) return units;
  const parts = clean.split(" ");
  if (parts.length <= 2 && tens[parts[0]]) {
    const unit = parts.length === 1 ? 0 : smallNumbers.indexOf(parts[1]);
    if (unit >= 0 && unit < 10) return tens[parts[0]] + unit;
  }
  return null;
}

function choices(question: IntakeQuestion, text: string): string[] | null {
  const options = question.options ?? [];
  const raw = words(text).replace(/^(?:please )?(?:select |choose )?/, "");
  // Numbered choices are explicit: "option one and option three".
  if (/^(?:(?:option|options|choice|choices)\b)/.test(raw)) {
    const numbered = words(text.replace(/[,;]/g, " and ")).replace(/^(?:please )?(?:select |choose )?/, "");
    const chunks = numbered.replace(/\b(?:option|options|choice|choices)\b/g, " ").split(/\band\b|\bplus\b/).map(s => s.trim()).filter(Boolean);
    const positions = chunks.map(number);
    if (!positions.length || positions.some(n => n === null || n < 1 || n > options.length)) return null;
    return [...new Set(positions.map(n => options[n! - 1].value))];
  }
  // Consume complete labels, longest first. Any unexplained words (including
  // negation or "or") make the answer ambiguous instead of selecting a guess.
  let remaining = ` ${raw} `;
  const matched: string[] = [];
  for (const option of [...options].sort((a, b) => b.label.length - a.label.length)) {
    const label = ` ${words(option.label)} `;
    if (remaining.includes(label)) {
      matched.push(option.value);
      remaining = remaining.replace(label, " ");
    }
  }
  if (words(remaining).replace(/\b(and|plus)\b/g, "").trim() || !matched.length) return null;
  return options.filter(option => matched.includes(option.value)).map(option => option.value);
}

// Second try, for natural speech like "I am deaf" or "I use a wheelchair": match words that
// belong to only one option's label. Every other word must be a common filler word, and
// "or" or a negation is refused, so nothing is guessed. The traveler still reviews the result.
const FILLER = new Set(("i am a an the and plus of to my me with in on at for can use using have has had " +
  "travel traveling it is be we our also please choose select option options really mostly usually " +
  "like love enjoy want need prefer hate dislike avoid find get some something lot lots very bit am im").split(" "));
const REFUSE = /\b(not|no|never|without|except|nor|neither|none|or)\b/;

function stem(word: string) {
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (/(ch|sh|ss|x)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function looseChoices(question: IntakeQuestion, text: string): string[] | null {
  const options = (question.options ?? []).filter(option => !/^something else$/i.test(option.label));
  let raw = ` ${words(text)} `;
  // Preference words carry meaning: never discard dislike/avoid as harmless
  // filler in an interests, needs, pace or transport answer. Avoidance questions
  // invert that meaning, so positive preferences must not become barriers either.
  const avoidance = ["avoid", "sensory_reduce", "surfaces"].includes(question.id);
  if (!avoidance && /\b(hate|dislike|avoid)\b/.test(raw)) return null;
  if (avoidance && /\b(like|love|enjoy)\b/.test(raw)) return null;
  if (avoidance && /\bprefer\b/.test(raw) && !/\bprefer (?:to )?(?:avoid|dislike|hate)\b/.test(raw)) return null;
  const matched = new Set<string>();
  // Whole labels first, so a label's own "or" ("Deaf or hard of hearing") is not refused.
  for (const option of [...options].sort((a, b) => b.label.length - a.label.length)) {
    const label = ` ${words(option.label)} `;
    if (raw.includes(label)) { matched.add(option.value); raw = raw.replace(label, " "); }
  }
  if (REFUSE.test(raw)) return null;
  const owners = new Map<string, Set<string>>(); // word -> the options whose label has it
  for (const option of options) {
    for (const word of words(option.label).split(" ").filter(w => w && !FILLER.has(w)).map(stem)) {
      owners.set(word, (owners.get(word) ?? new Set()).add(option.value));
    }
  }
  for (const word of raw.trim().split(/\s+/).filter(Boolean)) {
    if (FILLER.has(word)) continue;
    const owner = owners.get(stem(word));
    if (owner?.size !== 1) return null; // an unknown or shared word: do not guess
    matched.add([...owner][0]);
  }
  return matched.size ? options.filter(option => matched.has(option.value)).map(option => option.value) : null;
}

function dateAnswer(text: string): string | null {
  const clean = text.toLowerCase().replace(/[.,]/g, "").trim();
  let year: number, month: number, day: number;
  const iso = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const named = clean.match(/^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})$/);
  if (iso) [, year, month, day] = iso.map(Number);
  else if (named) {
    month = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].indexOf(named[1]) + 1;
    day = Number(named[2]); year = Number(named[3]);
  } else return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 2100 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function voiceAnswerHelp(question: IntakeQuestion): string {
  if (question.inputType === "must-nice") return 'Say, for example, "option two must have, option five nice to have." Each feature needs its own level.';
  if (question.inputType === "number") return 'Say a number, like "two."';
  if (question.inputType === "date") return 'Say the month, day, and year, like "October 22, 2026." You can edit what was heard.';
  if (question.inputType === "text") return "Say your answer in your own words.";
  return question.inputType === "multi"
    ? 'Say the choice labels, or numbers like "option one and option three." These will replace this question’s selected choices.'
    : 'Say one choice label, or its number, like "option two."';
}

export function parseVoiceAnswer(question: IntakeQuestion, transcript: string, current?: FieldValue): ParsedAnswer {
  const text = transcript.trim();
  if (!text) return { error: "Speak an answer first, or type it in the box below." };
  if (text.length > 2000) return { error: "Please shorten your answer to 2,000 characters." };
  if (question.inputType === "text") return { value: text, summary: text };
  if (question.inputType === "number") {
    const n = number(text);
    return n !== null && Number.isSafeInteger(n) && n >= 0
      ? { value: String(n), summary: String(n) }
      : { error: 'Please say or enter a whole number, like "two" or "2".' };
  }
  if (question.inputType === "date") {
    const date = dateAnswer(text);
    return date ? { value: date, summary: date } : { error: 'Please include the full date, like "October 22, 2026", or use the date field.' };
  }
  if (question.inputType === "must-nice") {
    const previous: MustNice = current && typeof current !== "string" && !Array.isArray(current) ? current : { must: [], nice: [] };
    const result: MustNice = { must: [...previous.must], nice: [...previous.nice] };
    const summaries: string[] = [];
    const seen = new Set<string>();
    for (const clause of text.split(/[,;]|\band\b/i).map(s => s.trim()).filter(Boolean)) {
      const normalized = words(clause);
      const levels = normalized.match(/\b(must have|nice to have|not needed)\b/g);
      if (levels?.length !== 1) return { error: 'Name a level for each feature. For example: "option two must have, option five nice to have."' };
      const level = levels[0];
      const selected = choices(question, normalized.replace(level, " "));
      if (selected?.length !== 1 || seen.has(selected[0])) return { error: "Please name one feature and one level at a time, without repeating a feature." };
      const feature = selected[0]; seen.add(feature);
      result.must = result.must.filter(f => f !== feature);
      result.nice = result.nice.filter(f => f !== feature);
      if (level === "must have") result.must.push(feature);
      if (level === "nice to have") result.nice.push(feature);
      summaries.push(`${question.options!.find(o => o.value === feature)!.label}: ${level}`);
    }
    return summaries.length ? { value: result, summary: summaries.join("; ") } : { error: "Please name a feature and its level." };
  }
  const selected = choices(question, text) ?? looseChoices(question, text);
  if (!selected || (question.inputType === "single" && selected.length !== 1)) {
    return { error: question.inputType === "single" ? 'Please name one choice, like "option two". We won’t guess your answer.' : 'Please use the shown labels or say "option one and option three". We won’t guess your answer.' };
  }
  return {
    value: question.inputType === "single" ? selected[0] : selected,
    summary: selected.map(value => question.options!.find(o => o.value === value)!.label).join(", "),
  };
}
