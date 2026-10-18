"use client";

import { useState } from "react";
import { api, type ItemOut, type TripOut } from "@/lib/api";
import { Spinner } from "@/components/Spinner";

function StopEditor({ item, busy, onSave }: {
  item: ItemOut;
  busy: boolean;
  onSave: (item: ItemOut, changes: { status: ItemOut["status"]; locked: boolean; user_note: string }) => Promise<void>;
}) {
  const [status, setStatus] = useState(item.status);
  const [locked, setLocked] = useState(item.locked);
  const [note, setNote] = useState(item.user_note ?? "");
  const changed = status !== item.status || locked !== item.locked || note.trim() !== (item.user_note ?? "");
  return (
    <form onSubmit={event => { event.preventDefault(); void onSave(item, { status, locked, user_note: note }); }} className="rounded-xl border border-border bg-background p-4">
      <fieldset disabled={busy}>
        <legend className="font-semibold">{item.title}</legend>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><label htmlFor={`status-${item.id}`} className="block text-sm font-medium">Stop status</label><select id={`status-${item.id}`} value={status} onChange={event => setStatus(event.target.value as ItemOut["status"])} className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2"><option value="planned">Planned</option><option value="in_progress">In progress</option><option value="done">Done</option><option value="skipped">Skip this stop</option></select></div>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={locked} onChange={event => setLocked(event.target.checked)} className="h-4 w-4 accent-primary" /> Keep this stop during AI re-planning</label>
        </div>
        <label htmlFor={`note-${item.id}`} className="mt-4 block text-sm font-medium">Personal note</label>
        <textarea id={`note-${item.id}`} value={note} onChange={event => setNote(event.target.value)} maxLength={500} rows={2} placeholder="A reminder for your visit…" className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        <button disabled={busy || !changed} type="submit" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy && <Spinner size={16} />} Save stop</button>
      </fieldset>
    </form>
  );
}

export function ManualItineraryEditor({ trip, onSaved }: { trip: TripOut; onSaved: (item: ItemOut) => void }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function save(item: ItemOut, changes: { status: ItemOut["status"]; locked: boolean; user_note: string }) {
    setBusy(true);
    setNotice("");
    setError("");
    try {
      onSaved(await api.updateItem(trip.id, item.id, changes));
      setNotice(`${item.title} is saved.`);
    } catch (error) { setError(error instanceof Error ? error.message : "We could not save that stop."); }
    finally { setBusy(false); }
  }

  return (
    <section id="manual-editor" aria-labelledby="manual-heading" className="rounded-2xl border border-primary/30 bg-accent-soft p-5 sm:p-6">
      <h2 id="manual-heading" className="text-xl font-bold">Edit your itinerary</h2>
      <p className="mt-2 text-sm text-muted">Skip or restore stops, keep favorites during AI changes, and add personal notes. Choose Planned to restore a skipped stop. These edits keep the existing schedule.</p>
      <p role="status" className="mt-3 text-sm text-primary">{notice}</p>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-5 space-y-6">{trip.days.map(day => <section key={day.day_index} aria-labelledby={`edit-day-${day.day_index}`}><h3 id={`edit-day-${day.day_index}`} className="mb-3 text-sm font-semibold">Day {day.day_index + 1} · {day.date}</h3><div className="space-y-3">{day.items.map(item => <StopEditor key={`${item.id}-${item.status}-${item.locked}-${item.user_note}`} item={item} busy={busy} onSave={save} />)}</div></section>)}</div>
    </section>
  );
}
