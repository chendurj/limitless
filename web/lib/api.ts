import type { components } from "@/types/api";
import { guestAccessToken } from "./guest-auth";

// Typed client for the Limitless API. One function for each route.
// Types come from web/types/api.d.ts (scripts/gen-types.sh). Do not edit those by hand.

type S = components["schemas"];
export type IntakeRequest = S["IntakeRequest"];
export type IntakeResponse = S["IntakeResponse"];
export type FollowupAnswers = S["FollowupAnswers"];
export type ProfileOut = S["ProfileOut"];
export type ProfilePatch = S["ProfilePatch"];
export type CreateTripRequest = S["CreateTripRequest"];
export type TripOut = S["TripOut"];
export type ItemOut = S["ItemOut"];
export type ItemPatch = S["ItemPatch"];
export type FeedbackRequest = S["FeedbackRequest"];
export type FeedbackResponse = S["FeedbackResponse"];
export type ReplanResult = S["ReplanResult"];
export type PlaceOut = S["PlaceOut"];
export type Fact = S["Fact"];

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** An API error. code is from the API error body, e.g. "VALIDATION_ERROR" or "LLM_UNAVAILABLE". */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(method: string, path: string, body?: unknown, publicSample = false): Promise<T> {
  // Sample reads are explicitly public; personal requests never fall back to the demo token.
  const token = publicSample ? null : await guestAccessToken();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "NETWORK", "We could not reach the server. Check that the API is running.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const error = data?.error ?? {};
    throw new ApiError(res.status, error.code ?? "HTTP_" + res.status, error.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

const id = encodeURIComponent;

export const api = {
  listProfiles: () => request<ProfileOut[]>("GET", "/api/profiles"),
  listTrips: () => request<TripOut[]>("GET", "/api/trips"),
  deleteTrip: (tripId: string) => request<{ deleted: boolean }>("DELETE", `/api/trips/${id(tripId)}`),
  getSampleTrip: (persona: "ankle" | "deaf") =>
    request<TripOut>("GET", `/api/trips/samples/${persona}`, undefined, true),
  /** Intake answers -> Accessibility DNA, a profile id and up to 3 follow-up questions. */
  intake: (body: IntakeRequest) => request<IntakeResponse>("POST", "/api/intake", body),
  /** Answers to the follow-up questions. One round only. */
  followups: (profileId: string, body: FollowupAnswers) =>
    request<IntakeResponse>("POST", `/api/intake/${id(profileId)}/followups`, body),
  getProfile: (profileId: string) => request<ProfileOut>("GET", `/api/profiles/${id(profileId)}`),
  updateProfile: (profileId: string, body: ProfilePatch) =>
    request<ProfileOut>("PATCH", `/api/profiles/${id(profileId)}`, body),

  /** Makes the itinerary. With the AI composer this can take up to about 45 s. */
  createTrip: (body: CreateTripRequest) => request<TripOut>("POST", "/api/trips", body),
  /** The current version, or an earlier or proposed version. */
  getTrip: (tripId: string, version?: number) =>
    request<TripOut>(
      "GET",
      `/api/trips/${id(tripId)}${version === undefined ? "" : `?version=${version}`}`,
    ),
  /** For example { status: "done" } or { locked: true }. */
  updateItem: (tripId: string, itemId: string, body: ItemPatch) =>
    request<ItemOut>("PATCH", `/api/trips/${id(tripId)}/items/${id(itemId)}`, body),

  /** Feedback -> a proposed version. It does not change the trip until applyVersion. */
  feedback: (tripId: string, body: FeedbackRequest) =>
    request<FeedbackResponse>("POST", `/api/trips/${id(tripId)}/feedback`, body),
  /** Apply a proposed version, or undo: give an earlier version number. */
  applyVersion: (tripId: string, version: number) =>
    request<ReplanResult>("POST", `/api/trips/${id(tripId)}/replan`, { apply_version: version }),

  listPlaces: (filter: { category?: string; neighborhood?: string } = {}) => {
    const query = new URLSearchParams(
      Object.entries(filter).filter((entry): entry is [string, string] => Boolean(entry[1])),
    ).toString();
    return request<PlaceOut[]>("GET", `/api/places${query ? `?${query}` : ""}`);
  },
  getPlace: (placeId: string) => request<PlaceOut>("GET", `/api/places/${id(placeId)}`),
};

/** The two demo trips made by scripts.demo_reset. Their ids do not change. */
export const DEMO_TRIPS = {
  ankle: "00000000-0000-4000-8000-0000000000b1",
  deaf: "00000000-0000-4000-8000-0000000000b2",
} as const;
