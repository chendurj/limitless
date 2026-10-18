/** Dates are calendar days, not local timestamps, so DST cannot change the night count. */
export function validateTripDates(start: string, end: string, today: string) {
  const startDate = start.trim();
  const endDate = end.trim();
  if (!startDate && !endDate) return {};
  if (!startDate || !endDate) return { error: "Choose both dates, or leave both blank." };
  function calendarDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const ms = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : null;
  }
  const first = calendarDate(startDate), last = calendarDate(endDate);
  if (first === null || last === null) return { error: "Choose valid start and end dates." };
  if (startDate < today) return { error: "Start date must be today or later." };
  if (last <= first) return { error: "End date must be after the start date." };
  const nights = (last - first) / 86400000;
  if (nights > 7) return { error: "For this demo, choose a trip of 1–7 nights." };
  return { start_date: startDate, end_date: endDate, nights };
}
