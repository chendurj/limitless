/**
 * intakeQuestions.ts — the single source of truth for the intake wizard.
 *
 * Built from prehack/demo-location-catalog-and-intake-tree.md.
 *
 * MVP scope: orthopedic / mobility and Deaf + non-speaking travelers.
 * The blind / low-vision and sensory / cognitive branches are written but
 * parked in `deferredScreens` at the bottom — re-add them to `intakeScreens`
 * (and their need options to NEEDS) when we scale.
 *
 * Shape: a short spine every traveler answers, plus branch questions that only
 * appear when an earlier answer makes them relevant (see `showIf`). A wheelchair
 * user never sees the communication questions, and vice versa.
 *
 * Two review contracts before this ships:
 *  - TODO(wording @Sashwath): all `prompt` / `label` / `help` text is a first
 *    draft. Keep it warm, plain, and never medical — ask about function, not
 *    diagnosis.
 *  - TODO(mapping @Chendur): each option `value` is the canonical token we store
 *    / send. The buckets (walk/stand/slope/rest) map to the numeric DNA fields
 *    in api/app/models/dna.py. A few new fields are flagged inline below.
 */

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type InputType =
  | "single" // pick one
  | "multi" // pick any number
  | "must-nice" // pick features, then tag each MUST HAVE or NICE TO HAVE
  | "text"
  | "date"
  | "number";

export type IntakeOption = {
  value: string; // canonical token stored and sent to the API
  label: string; // user-facing text
  help?: string; // optional one-line clarifier under the option
};

/**
 * A question is shown only if every condition passes (logical AND).
 * `includesAny` is for multi-select answers: it passes when the chosen values
 * overlap the listed ones. `equals` is for single-select answers.
 */
export type ShowCondition = {
  questionId: string;
  includesAny?: string[];
  equals?: string;
};

export type IntakeQuestion = {
  id: string;
  prompt: string;
  help?: string;
  inputType: InputType;
  options?: IntakeOption[];
  /** Dotted path into the Accessibility DNA, e.g. "mobility.slope_tolerance". */
  targetField: string;
  optional?: boolean;
  /** Show a free-text "Something else" field alongside the options. */
  allowOther?: boolean;
  /** Offer voice entry (we always let the user review the text before saving). */
  allowVoice?: boolean;
  /** Omit to always show. Otherwise all conditions must pass. */
  showIf?: ShowCondition[];
};

export type IntakeScreen = {
  id: string;
  title: string;
  description?: string;
  questions: IntakeQuestion[];
};

// ----------------------------------------------------------------------------
// Shared option sets
// ----------------------------------------------------------------------------

// Core need set for the MVP. Maps to mobility.needs, except service_animal and
// none, which the backend handles specially.
// Deferred need options (re-add when scaling): blind_low_vision, neurodivergent.
const NEEDS: IntakeOption[] = [
  { value: "wheelchair", label: "Wheelchair or mobility device" },
  { value: "limited_mobility", label: "Limited walking or standing" },
  { value: "temporary_injury", label: "Temporary injury" },
  { value: "deaf_hoh", label: "Deaf or hard of hearing" },
  { value: "non_speaking", label: "Non-speaking" },
  { value: "service_animal", label: "I travel with a service animal" },
  { value: "other", label: "Something else" },
  { value: "none", label: "No specific accessibility need" },
];

// Accessibility feature list, reused for must-haves. Matches the Feature enum.
// audio_description and braille_tactile are deferred with the blind branch.
const FEATURES: IntakeOption[] = [
  { value: "step_free_entrance", label: "Completely step-free entrance" },
  { value: "accessible_restroom", label: "Accessible restroom" },
  { value: "accessible_parking", label: "Accessible parking" },
  { value: "dropoff_zone", label: "Drop-off zone" },
  { value: "elevator", label: "Elevator" },
  { value: "seating", label: "Frequent seating" },
  { value: "wheelchair_rental", label: "Wheelchair or scooter rental" },
  { value: "beach_wheelchair", label: "Beach wheelchair or beach mat" },
  { value: "captions_asl", label: "Captions or ASL" },
  { value: "service_animal_ok", label: "Service animals permitted" },
];

// Shows the mobility branch for anyone who moves with a device or limited walking.
const MOBILITY: ShowCondition[] = [
  { questionId: "needs", includesAny: ["wheelchair", "limited_mobility", "temporary_injury"] },
];

// ----------------------------------------------------------------------------
// Screens (~10, matching the intake tree)
// ----------------------------------------------------------------------------

export const intakeScreens: IntakeScreen[] = [
  // 1 — Accessibility needs (spine) ------------------------------------------
  {
    id: "needs",
    title: "What should we plan around?",
    description: "Pick everything that applies. Your choices decide what we ask next.",
    questions: [
      {
        id: "needs",
        prompt: "What should we plan around?",
        inputType: "multi",
        options: NEEDS,
        targetField: "mobility.needs",
        allowVoice: true,
      },
    ],
  },

  // 2 — Mobility device and movement (branch) --------------------------------
  {
    id: "mobility-device",
    title: "Getting around",
    questions: [
      {
        id: "equipment",
        prompt: "What do you usually use to get around?",
        inputType: "multi",
        options: [
          { value: "manual_wheelchair", label: "Manual wheelchair" },
          { value: "powered_wheelchair", label: "Powered wheelchair" },
          { value: "mobility_scooter", label: "Mobility scooter" },
          { value: "walker", label: "Walker" },
          { value: "crutches", label: "Crutches" },
          { value: "cane", label: "Cane" },
          { value: "none", label: "No device" },
        ],
        targetField: "mobility.equipment",
        allowOther: true,
        showIf: MOBILITY,
      },
      {
        id: "walking",
        // Framed in real-world terms; the bucket maps to max_continuous_walk_m.
        prompt: "Which best describes getting between stops?",
        inputType: "single",
        options: [
          { value: "transfer_only", label: "I stay in my device and don't walk" },
          { value: "steps_1_5", label: "I can take 1–5 steps for transfers" },
          { value: "walk_lt_5min", label: "I can walk under 5 minutes" },
          { value: "walk_5_15min", label: "I can walk 5–15 minutes" },
          { value: "walk_15_30min", label: "I can walk 15–30 minutes" },
          { value: "walk_30min_plus", label: "Longer distances are comfortable" },
          { value: "varies", label: "It varies day to day" },
        ],
        targetField: "mobility.max_continuous_walk_m",
        showIf: MOBILITY,
      },
    ],
  },

  // 3 — Standing and rest (branch) -------------------------------------------
  {
    id: "standing-rest",
    title: "Standing and rest",
    questions: [
      {
        id: "standing",
        prompt: "How long can you stand comfortably?",
        inputType: "single",
        options: [
          { value: "cannot_stand", label: "I can't stand" },
          { value: "under_2min", label: "Under 2 minutes" },
          { value: "2_5min", label: "2–5 minutes" },
          { value: "5_15min", label: "5–15 minutes" },
          { value: "over_15min", label: "More than 15 minutes" },
          { value: "varies", label: "It varies" },
        ],
        targetField: "mobility.max_standing_min",
        showIf: MOBILITY,
      },
      {
        id: "rest",
        prompt: "How often should we plan a seated rest?",
        inputType: "single",
        options: [
          { value: "30", label: "Every 30 minutes" },
          { value: "45", label: "Every 45 minutes" },
          { value: "60", label: "Every hour" },
          { value: "90", label: "Every 90 minutes" },
          { value: "on_request", label: "Only when I ask" },
        ],
        targetField: "mobility.rest_every_min",
        showIf: MOBILITY,
      },
    ],
  },

  // 4 — Stairs, slopes and surfaces (branch) ---------------------------------
  {
    id: "terrain",
    title: "Slopes, stairs and surfaces",
    questions: [
      {
        id: "slope",
        prompt: "What kinds of slopes work for you?",
        inputType: "single",
        options: [
          { value: "flat_only", label: "Flat routes only" },
          { value: "gentle", label: "Gentle slopes are fine" },
          { value: "moderate_with_help", label: "Moderate slopes if someone helps" },
          { value: "moderate_independent", label: "Moderate slopes on my own" },
          { value: "steep_ok", label: "Steep slopes are okay" },
          { value: "unsure", label: "I'm not sure" },
        ],
        targetField: "mobility.slope_tolerance",
        showIf: MOBILITY,
      },
      {
        id: "stairs",
        prompt: "Can you use stairs?",
        inputType: "single",
        options: [
          { value: "none", label: "No stairs" },
          { value: "few_with_rail", label: "A few, with a handrail" },
          { value: "ok", label: "Stairs are okay" },
        ],
        targetField: "mobility.stairs_tolerance",
        showIf: MOBILITY,
      },
      {
        id: "surfaces",
        prompt: "Any surfaces we should avoid?",
        inputType: "multi",
        options: [
          { value: "uneven", label: "Uneven pavement" },
          { value: "cobblestone", label: "Cobblestone" },
          { value: "gravel_dirt", label: "Gravel or dirt" },
          { value: "grass", label: "Grass" },
          { value: "sand", label: "Sand" },
          { value: "none", label: "None of these" },
        ],
        targetField: "mobility.uneven_surface_tolerance",
        allowOther: true,
        showIf: MOBILITY,
      },
    ],
  },

  // 5 — Assistance and party -------------------------------------------------
  {
    id: "assistance-party",
    title: "Who's with you",
    questions: [
      {
        id: "companion_can_push",
        prompt: "Is someone with you who can help physically?",
        help: "For example, pushing on a slope or helping with a transfer.",
        inputType: "single",
        options: [
          { value: "yes", label: "Yes, including pushing or transfers" },
          { value: "light_only", label: "Yes, but only light help" },
          { value: "no", label: "No" },
          { value: "sometimes", label: "Sometimes" },
          { value: "unsure", label: "I'm not sure" },
        ],
        targetField: "party.companion_can_push",
        showIf: MOBILITY,
      },
      {
        id: "party",
        prompt: "Who are you traveling with?",
        inputType: "single",
        options: [
          { value: "alone", label: "On my own" },
          { value: "partner_friend", label: "Partner or friend" },
          { value: "family", label: "Family" },
          { value: "caregiver", label: "With a caregiver" },
          { value: "group", label: "A group" },
        ],
        targetField: "party",
      },
      {
        id: "party_size",
        prompt: "How many people, including you?",
        inputType: "number",
        targetField: "party.size",
        optional: true,
        showIf: [{ questionId: "party", includesAny: ["partner_friend", "family", "caregiver", "group"] }],
      },
    ],
  },

  // 6 — Must-haves and nice-to-haves (spine) ---------------------------------
  {
    id: "must-haves",
    title: "What every stop needs",
    description: "Tag each as a must-have or a nice-to-have. A missing must-have gets a place excluded or flagged to verify.",
    questions: [
      {
        id: "requirements",
        prompt: "What must every major stop have for you?",
        inputType: "must-nice",
        options: FEATURES,
        targetField: "requirements",
        allowOther: true,
      },
    ],
  },

  // 7 — Deaf and non-speaking supports (branch) ------------------------------
  {
    id: "communication",
    title: "Hearing and communication",
    questions: [
      // Deaf / hard-of-hearing
      {
        id: "hearing_features",
        prompt: "Which of these help you?",
        inputType: "multi",
        options: [
          { value: "captions", label: "Captions" },
          { value: "asl", label: "ASL interpretation" },
          { value: "assistive_listening", label: "Assistive listening device" },
          { value: "transcript", label: "Written tour transcript" },
          { value: "visual_alerts", label: "Visual emergency information" },
        ],
        targetField: "sensory",
        allowOther: true,
        showIf: [{ questionId: "needs", includesAny: ["deaf_hoh"] }],
      },
      {
        id: "advance_booking",
        prompt: "How do you feel about booking ahead?",
        help: "Some accessible services need a call or email in advance.",
        inputType: "single",
        options: [
          { value: "comfortable", label: "I'm comfortable booking ahead" },
          { value: "need_script", label: "Only if you give me the contact and a script" },
          { value: "prefer_walkup", label: "No — prefer places I can just show up to" },
        ],
        // TODO(mapping @Chendur): new preference field for the planner / verify-kit.
        targetField: "preferences.advance_booking_ok",
        showIf: [{ questionId: "needs", includesAny: ["deaf_hoh", "non_speaking"] }],
      },
      // Non-speaking
      {
        id: "communication_mode",
        prompt: "How do you prefer to communicate at a venue?",
        inputType: "single",
        options: [
          { value: "written_notes", label: "I write notes or type" },
          { value: "text_to_speech", label: "I use a text-to-speech app" },
          { value: "someone_speaks", label: "Someone with me speaks for me" },
          { value: "no_preference", label: "No preference" },
        ],
        // TODO(mapping @Chendur): new field sensory.communication_mode.
        targetField: "sensory.communication_mode",
        allowOther: true,
        showIf: [{ questionId: "needs", includesAny: ["non_speaking"] }],
      },
      {
        id: "contact_channel",
        prompt: "For booking and questions, what should we prefer?",
        inputType: "single",
        options: [
          { value: "prefer_text_email", label: "Places that take text or email" },
          { value: "phone_ok", label: "Phone calls are fine" },
          { value: "no_preference", label: "No preference" },
        ],
        // TODO(mapping @Chendur): new field sensory.contact_channel (avoid phone-only).
        targetField: "sensory.contact_channel",
        showIf: [{ questionId: "needs", includesAny: ["non_speaking"] }],
      },
    ],
  },

  // 8 — Interests and cuisines (spine) ---------------------------------------
  {
    id: "interests",
    title: "What you enjoy",
    questions: [
      {
        id: "interests",
        prompt: "What would you enjoy?",
        inputType: "multi",
        options: [
          { value: "beaches", label: "Beaches" },
          { value: "zoos_aquariums", label: "Zoos and aquariums" },
          { value: "museums", label: "Museums and art" },
          { value: "history", label: "History" },
          { value: "nature", label: "Nature" },
          { value: "photography", label: "Photography" },
          { value: "shopping", label: "Shopping" },
          { value: "sports", label: "Sports" },
          { value: "nightlife", label: "Nightlife" },
          { value: "theme_parks", label: "Theme parks" },
          { value: "food", label: "Food experiences" },
        ],
        targetField: "preferences.interests",
      },
      {
        id: "cuisines",
        prompt: "Any food you're in the mood for?",
        inputType: "multi",
        options: [
          { value: "italian", label: "Italian" },
          { value: "mexican", label: "Mexican" },
          { value: "indian", label: "Indian" },
          { value: "east_asian", label: "East Asian" },
          { value: "mediterranean", label: "Mediterranean" },
          { value: "seafood", label: "Seafood" },
          { value: "vegetarian", label: "Vegetarian" },
          { value: "vegan", label: "Vegan" },
          { value: "desserts", label: "Desserts and cafés" },
        ],
        targetField: "preferences.cuisines",
        optional: true,
        allowOther: true,
      },
    ],
  },

  // 9 — Avoidances (spine) ---------------------------------------------------
  {
    id: "avoid",
    title: "Anything to avoid",
    description: "Even if a place is technically accessible, we'll steer around these.",
    questions: [
      {
        id: "avoid",
        prompt: "What should we avoid?",
        inputType: "multi",
        options: [
          { value: "crowds", label: "Crowds" },
          { value: "hills", label: "Hills" },
          { value: "long_walks", label: "Long distances" },
          { value: "heat", label: "Heat or direct sun" },
          { value: "standing", label: "Standing" },
          { value: "noise", label: "Noise" },
          { value: "sand", label: "Sand" },
          { value: "uneven_surfaces", label: "Uneven surfaces" },
          { value: "bright_lights", label: "Bright lights" },
          // TODO(mapping @Chendur): "tight schedules" has no avoid enum — maps to a relaxed pace.
          { value: "tight_schedules", label: "Tight schedules" },
        ],
        targetField: "avoid",
        optional: true,
      },
    ],
  },

  // 10 — Trip basics, transport, pace (spine) --------------------------------
  {
    id: "trip",
    title: "Your trip",
    questions: [
      {
        id: "start_date",
        prompt: "When does your trip start?",
        inputType: "date",
        targetField: "trip.start_date",
        optional: true,
      },
      {
        id: "nights",
        prompt: "How many nights?",
        inputType: "number",
        targetField: "trip.nights",
        optional: true,
      },
      {
        id: "lodging_area",
        prompt: "Where are you staying?",
        help: "A neighborhood or hotel name is enough.",
        inputType: "text",
        targetField: "trip.lodging_area",
        optional: true,
      },
      {
        id: "transport",
        prompt: "How will you get around town?",
        inputType: "single",
        options: [
          { value: "car", label: "Personal car" },
          { value: "accessible_vehicle", label: "Accessible vehicle" },
          { value: "rideshare", label: "Rideshare" },
          { value: "transit", label: "Public transit" },
          { value: "walk_roll", label: "Walking or rolling" },
        ],
        targetField: "trip.needs_car",
      },
      {
        id: "pace",
        prompt: "What pace feels right?",
        inputType: "single",
        options: [
          { value: "relaxed", label: "Relaxed — fewer stops, more time" },
          { value: "moderate", label: "Moderate" },
          { value: "busy", label: "Busy — fit in a lot" },
        ],
        targetField: "preferences.pace",
      },
    ],
  },
];

// ----------------------------------------------------------------------------
// Deferred branches — NOT shown in the MVP.
//
// To enable later: add their need options back to NEEDS
// (blind_low_vision, neurodivergent), re-add audio_description and
// braille_tactile to FEATURES, and splice these screens into `intakeScreens`.
// ----------------------------------------------------------------------------

export const deferredScreens: IntakeScreen[] = [
  {
    id: "vision",
    title: "Vision supports",
    questions: [
      {
        id: "vision_level",
        prompt: "How would you describe your vision for planning?",
        inputType: "single",
        options: [
          { value: "none", label: "Blind" },
          { value: "light_perception", label: "Light perception" },
          { value: "low_vision", label: "Low vision" },
          { value: "prefer_not_say", label: "Prefer not to say — plan using my supports" },
        ],
        targetField: "sensory.vision_level",
        showIf: [{ questionId: "needs", includesAny: ["blind_low_vision"] }],
      },
      {
        id: "nav_aid",
        prompt: "What navigation support do you use?",
        inputType: "multi",
        options: [
          { value: "cane", label: "White cane" },
          { value: "guide_dog", label: "Guide dog" },
          { value: "sighted_guide", label: "Sighted guide or companion" },
          { value: "phone_nav", label: "Phone navigation" },
          { value: "none", label: "None" },
        ],
        targetField: "sensory.nav_aid",
        allowOther: true,
        showIf: [{ questionId: "needs", includesAny: ["blind_low_vision"] }],
      },
      {
        id: "blv_solo",
        prompt: "Are you traveling without a sighted companion?",
        help: "This helps us keep you away from unfenced edges and drop-offs.",
        inputType: "single",
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
          { value: "sometimes", label: "Sometimes" },
        ],
        targetField: "party.travels_solo",
        showIf: [{ questionId: "needs", includesAny: ["blind_low_vision"] }],
      },
    ],
  },
  {
    id: "sensory",
    title: "Sensory and cognitive supports",
    questions: [
      {
        id: "sensory_reduce",
        prompt: "What should we try to reduce?",
        inputType: "multi",
        options: [
          { value: "crowds", label: "Crowds" },
          { value: "noise", label: "Noise" },
          { value: "bright_lights", label: "Bright lights" },
          { value: "strong_smells", label: "Strong smells" },
          { value: "long_waits", label: "Long or unpredictable waits" },
          { value: "complex_nav", label: "Complex navigation" },
        ],
        targetField: "sensory.sensitivities",
        allowOther: true,
        showIf: [{ questionId: "needs", includesAny: ["neurodivergent"] }],
      },
    ],
  },
];

// ----------------------------------------------------------------------------
// Helpers for the wizard engine
// ----------------------------------------------------------------------------

/** One answer, keyed by question id. Multi-select answers are string arrays. */
export type AnswerMap = Record<string, string | string[] | number | null | undefined>;

function conditionMet(condition: ShowCondition, answers: AnswerMap): boolean {
  const answer = answers[condition.questionId];
  if (condition.includesAny) {
    const chosen = Array.isArray(answer) ? answer : answer == null ? [] : [String(answer)];
    return condition.includesAny.some((v) => chosen.includes(v));
  }
  if (condition.equals !== undefined) {
    return answer === condition.equals;
  }
  return answer != null;
}

/** Whether a question should be shown given the answers so far. */
export function isVisible(question: IntakeQuestion, answers: AnswerMap): boolean {
  if (!question.showIf) return true;
  return question.showIf.every((c) => conditionMet(c, answers));
}

/** The questions currently in play, flattened in order. Drives the step count. */
export function visibleQuestions(answers: AnswerMap): IntakeQuestion[] {
  return intakeScreens
    .flatMap((screen) => screen.questions)
    .filter((question) => isVisible(question, answers));
}

/** Screens that still have at least one visible question. */
export function visibleScreens(answers: AnswerMap): IntakeScreen[] {
  return intakeScreens.filter((screen) =>
    screen.questions.some((question) => isVisible(question, answers)),
  );
}
