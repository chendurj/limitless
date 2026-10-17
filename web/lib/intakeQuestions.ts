/**
 * intakeQuestions.ts — the single source of truth for the intake wizard.
 *
 * Built from prehack/demo-location-catalog-and-intake-tree.md.
 * Keys and option values match api/app/models/dna.py (confirmed in Chendur's
 * PR #10 review). The communication.* fields land with the backend
 * communication PR; regenerate web/types/api.d.ts after it merges.
 *
 * MVP scope: orthopedic / mobility and Deaf + non-speaking travelers.
 * The blind / low-vision and sensory / cognitive branches live in
 * deferredScreens at the bottom — add them back to intakeScreens (and their
 * need options to NEEDS) when we scale.
 *
 * Shape: a short spine every traveler answers, plus branch questions that only
 * appear when an earlier answer makes them relevant (see showIf).
 *
 * TODO(wording @Sashwath): the prompt / label / help text is a first draft.
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
 * includesAny is for multi-select answers: it passes when the chosen values
 * overlap the listed ones. equals is for single-select answers.
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

// Core need set for the MVP. Maps to the DNA `needs` list, except service_animal.
// Deferred need options (re-add when scaling): blind_low_vision, sensory_cognitive.
// non_speaking arrives with the backend communication PR.
const NEEDS: IntakeOption[] = [
  { value: "mobility_device", label: "Wheelchair or mobility device" },
  { value: "limited_mobility", label: "Limited walking or standing" },
  { value: "temporary_injury", label: "Temporary injury" },
  { value: "deaf_hoh", label: "Deaf or hard of hearing" },
  { value: "non_speaking", label: "Non-speaking" },
  { value: "service_animal", label: "I travel with a service animal" },
  { value: "other", label: "Something else" },
];

// Accessibility feature list, reused for must-haves. Matches the Requirements enum.
const FEATURES: IntakeOption[] = [
  { value: "step_free_entrance", label: "Completely step-free entrance" },
  { value: "accessible_restroom", label: "Accessible restroom" },
  { value: "accessible_parking", label: "Accessible parking" },
  { value: "dropoff_zone", label: "Drop-off zone" },
  { value: "elevator", label: "Elevator" },
  { value: "seating", label: "Frequent seating" },
  { value: "mobility_rental", label: "Wheelchair or scooter rental" },
  { value: "beach_wheelchair_or_mat", label: "Beach wheelchair or beach mat" },
  { value: "captions_or_asl", label: "Captions or ASL" },
  { value: "service_animal_ok", label: "Service animals permitted" },
];

// Shows the mobility branch for anyone who moves with a device or limited walking.
const MOBILITY: ShowCondition[] = [
  { questionId: "needs", includesAny: ["mobility_device", "limited_mobility", "temporary_injury"] },
];

// Shows the hearing / communication branch.
const DEAF_OR_NONSPEAKING: ShowCondition[] = [
  { questionId: "needs", includesAny: ["deaf_hoh", "non_speaking"] },
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
        targetField: "needs",
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
        // Framed in real-world terms; the bucket maps to mobility.walking.
        prompt: "Which best describes getting between stops?",
        inputType: "single",
        options: [
          { value: "cannot_walk", label: "I stay in my device and don't walk" },
          { value: "transfer_steps_only", label: "I can take 1–5 steps for transfers" },
          { value: "under_5_min", label: "I can walk under 5 minutes" },
          { value: "5_to_15_min", label: "I can walk 5–15 minutes" },
          { value: "15_to_30_min", label: "I can walk 15–30 minutes" },
          { value: "long_ok", label: "Longer distances are comfortable" },
          { value: "varies", label: "It varies day to day" },
        ],
        targetField: "mobility.walking",
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
          { value: "under_2_min", label: "Under 2 minutes" },
          { value: "2_to_5_min", label: "2–5 minutes" },
          { value: "5_to_15_min", label: "5–15 minutes" },
          { value: "over_15_min", label: "More than 15 minutes" },
          { value: "varies", label: "It varies" },
        ],
        targetField: "mobility.standing",
        showIf: MOBILITY,
      },
      {
        id: "rest",
        prompt: "How often should we plan a seated rest?",
        inputType: "single",
        options: [
          { value: "30_min", label: "Every 30 minutes" },
          { value: "45_min", label: "Every 45 minutes" },
          { value: "60_min", label: "Every hour" },
          { value: "90_min", label: "Every 90 minutes" },
          { value: "on_request", label: "Only when I ask" },
        ],
        targetField: "mobility.rest_interval",
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
          { value: "moderate", label: "Moderate slopes on my own" },
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
          { value: "uneven_pavement", label: "Uneven pavement" },
          { value: "cobblestone", label: "Cobblestone" },
          { value: "gravel_dirt", label: "Gravel or dirt" },
          { value: "grass", label: "Grass" },
          { value: "sand", label: "Sand" },
        ],
        targetField: "mobility.surfaces_to_avoid",
        optional: true,
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
          { value: "push_and_transfer", label: "Yes, including pushing or transfers" },
          { value: "light_only", label: "Yes, but only light help" },
          { value: "no", label: "No" },
          { value: "sometimes", label: "Sometimes" },
          { value: "unsure", label: "I'm not sure" },
        ],
        targetField: "party.companion_assist",
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
        targetField: "party.travel_with",
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
          { value: "asl_interpretation", label: "ASL interpretation" },
          { value: "assistive_listening", label: "Assistive listening device" },
          { value: "written_transcript", label: "Written tour transcript" },
          { value: "visual_emergency_info", label: "Visual emergency information" },
        ],
        targetField: "hearing.supports",
        allowOther: true,
        showIf: [{ questionId: "needs", includesAny: ["deaf_hoh"] }],
      },
      {
        id: "advance_booking",
        prompt: "How do you feel about booking ahead?",
        help: "Some accessible services need a call or email in advance.",
        inputType: "single",
        options: [
          { value: "yes", label: "I'm comfortable booking ahead" },
          { value: "with_contact_and_script", label: "Only if you give me the contact and a script" },
          { value: "no", label: "No — prefer places I can just show up to" },
        ],
        targetField: "hearing.advance_booking",
        showIf: DEAF_OR_NONSPEAKING,
      },
      // Non-speaking
      {
        id: "communication_mode",
        prompt: "How do you prefer to communicate at a venue?",
        inputType: "multi",
        options: [
          { value: "writing_or_typing", label: "I write or type" },
          { value: "aac_device", label: "I use a speech app (AAC)" },
          { value: "companion_speaks", label: "Someone with me speaks for me" },
          { value: "sign_language", label: "Sign language" },
          { value: "gestures_pointing", label: "Gestures or pointing" },
          { value: "limited_speech", label: "I can speak a little" },
        ],
        targetField: "communication.methods",
        allowOther: true,
        showIf: [{ questionId: "needs", includesAny: ["non_speaking"] }],
      },
      {
        id: "phone_calls",
        prompt: "Can you make voice phone calls?",
        inputType: "single",
        options: [
          { value: "yes", label: "Yes" },
          { value: "with_relay", label: "Yes, with a relay service" },
          { value: "no", label: "No" },
        ],
        targetField: "communication.phone_calls",
        showIf: DEAF_OR_NONSPEAKING,
      },
      {
        id: "contact_preferences",
        prompt: "How should venues contact you?",
        inputType: "multi",
        options: [
          { value: "text_sms", label: "Text / SMS" },
          { value: "email", label: "Email" },
          { value: "online_chat", label: "Online chat" },
          { value: "in_person_written", label: "In person, in writing" },
        ],
        targetField: "communication.contact_preferences",
        showIf: DEAF_OR_NONSPEAKING,
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
          { value: "museums_art", label: "Museums and art" },
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
          { value: "desserts_cafes", label: "Desserts and cafés" },
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
          { value: "long_distances", label: "Long distances" },
          { value: "heat_sun", label: "Heat or direct sun" },
          { value: "standing", label: "Standing" },
          { value: "noise", label: "Noise" },
          { value: "sand", label: "Sand" },
          { value: "uneven_surfaces", label: "Uneven surfaces" },
          { value: "bright_lights", label: "Bright lights" },
          { value: "tight_schedules", label: "Tight schedules" },
        ],
        targetField: "preferences.avoid",
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
          { value: "personal_car", label: "Personal car" },
          { value: "accessible_vehicle", label: "Accessible vehicle" },
          { value: "rideshare", label: "Rideshare" },
          { value: "transit", label: "Public transit" },
          { value: "walk_roll", label: "Walking or rolling" },
        ],
        targetField: "trip.transport",
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
// (blind_low_vision, sensory_cognitive), re-add audio_description and
// braille_tactile to FEATURES, and splice these screens into intakeScreens.
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
          { value: "blind", label: "Blind" },
          { value: "light_perception", label: "Light perception" },
          { value: "low_vision", label: "Low vision" },
          { value: "prefer_not_to_say", label: "Prefer not to say — plan using my supports" },
        ],
        targetField: "vision.level",
        showIf: [{ questionId: "needs", includesAny: ["blind_low_vision"] }],
      },
      {
        id: "nav_aid",
        prompt: "What navigation support do you use?",
        inputType: "multi",
        options: [
          { value: "white_cane", label: "White cane" },
          { value: "guide_dog", label: "Guide dog" },
          { value: "sighted_guide", label: "Sighted guide or companion" },
          { value: "phone_navigation", label: "Phone navigation" },
          { value: "none", label: "None" },
        ],
        targetField: "vision.nav_aids",
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
        targetField: "vision.without_sighted_companion",
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
          { value: "complex_navigation", label: "Complex navigation" },
        ],
        targetField: "sensory.reduce",
        allowOther: true,
        showIf: [{ questionId: "needs", includesAny: ["sensory_cognitive"] }],
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
