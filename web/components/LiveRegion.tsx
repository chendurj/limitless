"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type Politeness = "polite" | "assertive";

type LiveRegionValue = {
  /**
   * Send a message to a screen reader without moving focus.
   * Use "polite" for status updates and "assertive" for things the user
   * must hear right away, like a re-plan result.
   */
  announce: (message: string, politeness?: Politeness) => void;
};

const LiveRegionContext = createContext<LiveRegionValue | null>(null);

export function LiveRegionProvider({ children }: { children: ReactNode }) {
  const [politeMessage, setPoliteMessage] = useState("");
  const [assertiveMessage, setAssertiveMessage] = useState("");

  const announce = useCallback(
    (message: string, politeness: Politeness = "polite") => {
      const setMessage =
        politeness === "assertive" ? setAssertiveMessage : setPoliteMessage;
      // Clear first so the same message twice in a row is still read out.
      setMessage("");
      window.setTimeout(() => setMessage(message), 50);
    },
    [],
  );

  return (
    <LiveRegionContext.Provider value={{ announce }}>
      {children}
      {/* Two always-present regions the whole app can write to. */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {politeMessage}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {assertiveMessage}
      </div>
    </LiveRegionContext.Provider>
  );
}

/** Returns announce(). Throws if used outside the provider. */
export function useAnnounce() {
  const context = useContext(LiveRegionContext);
  if (!context) {
    throw new Error("useAnnounce must be used inside a LiveRegionProvider");
  }
  return context.announce;
}
