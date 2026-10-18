import type { ReactNode } from "react";

// Confidence shown for every accessibility fact. Color always comes with an
// icon and a word, so it never relies on color alone. Reused on the itinerary.
export type Confidence = "VERIFIED" | "COMMUNITY" | "INFERRED";

const CheckIcon = (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1 14-4-4 1.4-1.4L11 13.2l4.6-4.6L17 10Z" />
  </svg>
);

const UsersIcon = (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 2c-3 0-6 1.5-6 4v1h12v-1c0-2.5-3-4-6-4Zm7-2a3 3 0 1 0-2-5.2A4.5 4.5 0 0 1 16 11Zm1 2c2.4.2 4 1.5 4 3.5v1h-3v-1c0-1.3-.4-2.4-1-3.3Z" />
  </svg>
);

const InfoIcon = (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 5a1.3 1.3 0 1 1 0 2.6A1.3 1.3 0 0 1 12 7Zm1.2 10h-2.4v-6h2.4Z" />
  </svg>
);

const styles: Record<
  Confidence,
  { label: string; icon: ReactNode; className: string }
> = {
  VERIFIED: {
    label: "Verified",
    icon: CheckIcon,
    className:
      "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  },
  COMMUNITY: {
    label: "Community",
    icon: UsersIcon,
    className: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  },
  INFERRED: {
    label: "Inferred",
    icon: InfoIcon,
    className:
      "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  },
};

// Demo data is never verified, so it gets its own neutral badge whatever its level.
const demoStyle = {
  label: "Demo",
  icon: InfoIcon,
  className: "bg-surface-muted text-muted",
};

export function ConfidenceBadge({
  level,
  demo = false,
}: {
  level: Confidence;
  demo?: boolean;
}) {
  const style = demo ? demoStyle : styles[level];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${style.className}`}
    >
      {style.icon}
      {style.label}
    </span>
  );
}
