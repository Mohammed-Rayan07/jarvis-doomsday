import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { addDays, startOfDay } from "date-fns";

// All date math happens in Tony's timezone, never the server's (BUILD_SPEC D3).

/** [start, end) of the day `offsetDays` from today in `tz`, as UTC Dates. */
export function dayRange(offsetDays: number, tz: string): [Date, Date] {
  const startZoned = addDays(startOfDay(toZonedTime(new Date(), tz)), offsetDays);
  return [fromZonedTime(startZoned, tz), fromZonedTime(addDays(startZoned, 1), tz)];
}

export function formatInTz(iso: string, tz: string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    ...opts,
  }).format(new Date(iso));
}
