"use client";

import Link from "next/link";
import { useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };
const suggestions = ["How does Limitless work?", "Help me describe my access needs", "What should I check before a trip?"];

export function AskAnything() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);

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
    <section id="ask-anything" aria-labelledby="ask-heading" className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <p className="text-sm font-semibold text-primary">Your AI travel assistant · 24/7</p>
      <h2 id="ask-heading" className="mt-2 text-2xl font-bold">Ask me anything</h2>
      <p className="mt-2 text-sm text-muted">A little help before your next adventure. Ask about planning, access needs, or how Limitless works.</p>
      <div role="log" aria-label="Conversation with Limitless" aria-live="polite" aria-relevant="additions" className="mt-5 max-h-80 space-y-4 overflow-y-auto">
        {messages.map((message, index) => (
          <div key={index} className={`rounded-xl p-3 text-sm ${message.role === "user" ? "ml-5 bg-accent-soft" : "mr-5 bg-surface-muted"}`}>
            <p className="mb-1 font-semibold">{message.role === "user" ? "You" : "Limitless"}</p>
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        ))}
      </div>
      {!messages.length && <div className="mt-4 flex flex-wrap gap-2">
        {suggestions.map(text => <button key={text} type="button" disabled={pending} onClick={() => void send(text)} className="rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-accent-soft disabled:opacity-50">{text}</button>)}
      </div>}
      <p role="status" className="mt-3 text-sm text-muted">{pending ? "Limitless is thinking…" : ""}</p>
      {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
      <form className="mt-3" onSubmit={event => { event.preventDefault(); void send(question); }}>
        <label htmlFor="assistant-question" className="text-sm font-semibold">Your question</label>
        <textarea ref={input} id="assistant-question" value={question} onChange={event => setQuestion(event.target.value)} maxLength={2000} rows={3} readOnly={pending} required placeholder="How can I plan a day with fewer stairs?" aria-describedby="chat-privacy" className="mt-2 w-full resize-y rounded-lg border border-border bg-background p-3 text-base" />
        <div className="mt-3 flex items-center justify-between gap-3">
          <button type="submit" disabled={pending || !question.trim()} className="rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50">{pending ? "Sending…" : "Ask Limitless"}</button>
          {!!messages.length && <button type="button" disabled={pending} onClick={() => { setMessages([]); setQuestion(""); setError(""); input.current?.focus(); }} className="text-sm text-primary underline underline-offset-4 disabled:opacity-50">New chat</button>}
        </div>
      </form>
      <p id="chat-privacy" className="mt-4 text-xs text-muted">Messages are sent to OpenAI to answer you. Chat stays in this page until you leave. Avoid sharing sensitive information. AI can make mistakes; venue access details need sourced verification.</p>
      <Link href="/intake" className="mt-3 inline-block text-sm font-semibold text-primary underline underline-offset-4">Plan your trip with sourced accessibility facts →</Link>
    </section>
  );
}
