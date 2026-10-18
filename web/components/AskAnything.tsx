"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };
const allowedPaths = new Set([
  "/intake", "/features", "/how-it-works", "/reviews",
  "/trips/00000000-0000-4000-8000-0000000000b2",
]);
const starters = ["Help me plan my first trip", "How do I change my itinerary?", "What can you help me with?"];

// Render only confirmed app links. Model output never becomes HTML or arbitrary URLs.
function ReplyText({ text }: { text: string }) {
  return <>{text.split(/(\[[^\]\n]+\]\([^\s)]+\)|\*\*[^*\n]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    const match = part.match(/^\[([^\]\n]+)\]\(([^\s)]+)\)$/);
    return match && allowedPaths.has(match[2])
      ? <Link key={index} href={match[2]} className="font-medium text-teal-300 underline underline-offset-4">{match[1]}</Link>
      : <span key={index}>{match ? match[1] : part}</span>;
  })}</>;
}

export function AskAnything() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, pending]);

  async function send(text: string) {
    if (busy.current || !text.trim()) return;
    busy.current = true;
    setOpen(true);
    setPending(true);
    setPendingQuestion(text.trim());
    setError("");
    // Retain up to twenty exchanges. Drop oldest complete pairs to respect the
    // request size limit without cutting messages or starting mid-exchange.
    const history: Message[] = [...messages.slice(-40), { role: "user", content: text.trim() }];
    while (JSON.stringify({ messages: history }).length > 60000 && history.length > 1) history.splice(0, 2);
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }), signal: AbortSignal.timeout(55000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Please try again shortly.");
      if (typeof data.message !== "string") throw new Error("Please try again shortly.");
      setMessages(previous => [...previous, history[history.length - 1], { role: "assistant", content: data.message }]);
      setQuestion("");
    } catch (cause) {
      setQuestion(text);
      setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "The reply took too long. Your question is still here—please try again.");
    } finally {
      busy.current = false;
      setPending(false);
      setPendingQuestion("");
      input.current?.focus();
    }
  }

  return (
    <section id="ask-anything" aria-label="Ask Limitless" className="mt-4 w-full max-w-md text-left">
      {open && (
        <div className="mb-3 rounded-2xl border border-white/15 bg-[#070b10]/95 p-4 text-sm leading-relaxed text-zinc-200 shadow-xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-semibold text-teal-300">Limitless assistant</p>
            <div className="flex gap-3">
              <button type="button" disabled={pending} onClick={() => { setMessages([]); setQuestion(""); setError(""); input.current?.focus(); }} className="text-xs text-zinc-300 underline underline-offset-4 disabled:opacity-40">New chat</button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Minimize conversation" className="text-xs text-zinc-300 underline underline-offset-4">Minimize</button>
            </div>
          </div>
          <div ref={log} role="log" aria-label="Conversation with Limitless" aria-live="polite" aria-relevant="additions" tabIndex={0} className="max-h-80 space-y-3 overflow-y-auto overscroll-contain">
            {!messages.length && !pending && <div className="rounded-xl bg-teal-300/5 p-3">
              <p>Hi! I can help you get started, describe your access needs, or find your way around Limitless. What would you like help with?</p>
              <div className="mt-3 flex flex-wrap gap-2">{starters.map(text => <button key={text} type="button" onClick={() => void send(text)} className="rounded-lg border border-white/15 px-3 py-2 text-left text-xs text-teal-200 hover:bg-white/10">{text}</button>)}</div>
            </div>}
            {messages.map((message, index) => (
              <div key={index} className={`rounded-xl p-3 ${message.role === "user" ? "ml-4 bg-white/10" : "mr-4 bg-teal-300/5"}`}>
                <p className="mb-1 text-xs font-semibold text-teal-200">{message.role === "user" ? "You" : "Limitless"}</p>
                <p className="whitespace-pre-wrap break-words">{message.role === "assistant" ? <ReplyText text={message.content} /> : message.content}</p>
              </div>
            ))}
            {pending && <div className="ml-4 rounded-xl bg-white/10 p-3"><p className="mb-1 text-xs font-semibold text-teal-200">You</p><p className="whitespace-pre-wrap break-words">{pendingQuestion}</p></div>}
          </div>
          <p role="status" className="text-zinc-400">{pending ? "Limitless is thinking…" : ""}</p>
          {error && <p role="alert" className="mt-2 text-rose-200">{error} Send your question again to retry.</p>}
          <p className="mt-3 text-xs text-zinc-400">Chat stays on this page until you leave. Avoid sensitive details. AI can make mistakes; venue access needs sourced verification.</p>
        </div>
      )}
      <form className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2" onSubmit={event => { event.preventDefault(); void send(question); }}>
        <label htmlFor="assistant-question" className="sr-only">{messages.length ? "Reply to Limitless" : "Ask anything"}</label>
        <input ref={input} id="assistant-question" type="text" value={question} onFocus={() => setOpen(true)} onChange={event => setQuestion(event.target.value)} maxLength={2000} readOnly={pending} required placeholder={messages.length ? "Keep the conversation going…" : "Ask anything…"} aria-describedby="chat-privacy" className="h-9 min-w-0 flex-1 bg-transparent text-white placeholder:text-zinc-400" />
        <button type="submit" disabled={pending || !question.trim()} aria-label={pending ? "Sending question" : "Ask Limitless"} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-200 transition-colors hover:bg-white/10 disabled:opacity-40">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3 10l12 2-12 2 .4 6.4Z" /></svg>
        </button>
      </form>
      <p id="chat-privacy" className="mt-2 text-center text-xs text-zinc-400">24/7 AI assistant</p>
    </section>
  );
}
