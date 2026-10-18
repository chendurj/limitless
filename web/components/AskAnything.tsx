"use client";

import Link from "next/link";
import { useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

export function AskAnything() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  async function send(text: string) {
    if (busy.current || !text.trim()) return;
    busy.current = true;
    setPending(true);
    setError("");
    const history: Message[] = [...messages.slice(-10), { role: "user", content: text.trim() }];
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }), signal: AbortSignal.timeout(55000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Please try again shortly.");
      if (typeof data.message !== "string") throw new Error("Please try again shortly.");
      setMessages([...history, { role: "assistant", content: data.message }]);
      setQuestion("");
    } catch (cause) {
      setQuestion(text);
      setError(cause instanceof Error ? cause.message : "Couldn't connect. Please try again.");
    } finally {
      busy.current = false;
      setPending(false);
      input.current?.focus();
    }
  }

  return (
    <section id="ask-anything" aria-label="Ask Limitless" className="mt-4 w-full max-w-md text-left">
      <form className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2" onSubmit={event => { event.preventDefault(); void send(question); }}>
        <label htmlFor="assistant-question" className="sr-only">Ask anything</label>
        <input ref={input} id="assistant-question" type="text" value={question} onChange={event => setQuestion(event.target.value)} maxLength={2000} readOnly={pending} required placeholder="Ask anything…" aria-describedby="chat-privacy" className="h-9 min-w-0 flex-1 bg-transparent text-white placeholder:text-zinc-400" />
        <button type="submit" disabled={pending || !question.trim()} aria-label={pending ? "Sending question" : "Ask Limitless"} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-200 transition-colors hover:bg-white/10 disabled:opacity-40">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M3.4 20.4 21 12 3.4 3.6 3 10l12 2-12 2 .4 6.4Z" />
          </svg>
        </button>
      </form>
      <p id="chat-privacy" className="mt-2 text-center text-xs text-zinc-400">24/7 AI assistant</p>
      {(messages.length > 0 || pending || error) && (
        <div className="mt-4 rounded-2xl border border-white/15 bg-[#070b10]/90 p-4 text-sm text-zinc-200 shadow-xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-semibold text-teal-300">Limitless assistant</p>
            <button type="button" disabled={pending} onClick={() => { setMessages([]); setQuestion(""); setError(""); input.current?.focus(); }} className="text-xs text-zinc-300 underline underline-offset-4 disabled:opacity-40">New chat</button>
          </div>
          <div role="log" aria-label="Conversation with Limitless" aria-live="polite" aria-relevant="additions" className="max-h-64 space-y-3 overflow-y-auto">
            {messages.map((message, index) => (
              <div key={index} className={`rounded-xl p-3 ${message.role === "user" ? "ml-4 bg-white/10" : "mr-4 bg-teal-300/5"}`}>
                <p className="mb-1 text-xs font-semibold text-teal-200">{message.role === "user" ? "You" : "Limitless"}</p>
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            ))}
          </div>
          <p role="status" className="text-zinc-400">{pending ? "Limitless is thinking…" : ""}</p>
          {error && <p role="alert" className="mt-2 text-rose-200">{error}</p>}
          <p className="mt-3 text-xs text-zinc-400">Chat stays on this page until you leave. Avoid sensitive details. AI can make mistakes; venue access needs sourced verification.</p>
          <Link href="/intake" className="mt-3 inline-block text-xs font-semibold text-teal-300 underline underline-offset-4">Plan your trip with sourced accessibility facts →</Link>
        </div>
      )}
    </section>
  );
}
