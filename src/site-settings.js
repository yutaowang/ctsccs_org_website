export const DEFAULT_SCHOOL_YEAR_START_DATE = "2026-09-06";
export const DEFAULT_ONLINE_REGISTRATION_OPEN_AT = "2026-07-20T09:00:00-04:00";
export const DEFAULT_REGISTRATION_CHANGE_DEADLINE = "2026-09-21";

export function settingDate(value, fallback = "") {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  return value.date || value.deadline || value.text || fallback;
}

export function settingDateTime(value, fallback = "") {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  return value.datetime || value.dateTime || value.text || fallback;
}

function dateTimeParts(dateTimeText) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(dateTimeText || ""));
  if (!match) return dateTimeParts(DEFAULT_ONLINE_REGISTRATION_OPEN_AT);
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
}

export function dateParts(dateText) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateText || ""));
  if (!match) return dateParts(DEFAULT_SCHOOL_YEAR_START_DATE);
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function formatEnglishDate(dateText) {
  const { year, month, day } = dateParts(dateText);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatMonthAbbreviation(dateText) {
  const { year, month, day } = dateParts(dateText);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day))).toUpperCase();
}

export function formatChineseDate(dateText) {
  const { year, month, day } = dateParts(dateText);
  return `${year} 年 ${month} 月 ${day} 日`;
}

export function formatChineseDateTime(dateTimeText) {
  const { year, month, day, hour, minute } = dateTimeParts(dateTimeText);
  const period = hour < 12 ? "上午" : "下午";
  const displayHour = hour % 12 || 12;
  const displayMinute = minute ? ` ${minute} 分` : "";
  return `${year} 年 ${month} 月 ${day} 日${period} ${displayHour} 时${displayMinute}`;
}

export function formatEnglishDateTime(dateTimeText) {
  const { year, month, day, hour, minute } = dateTimeParts(dateTimeText);
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period} on ${formatEnglishDate(date)}`;
}

export function formatShortDate(dateText) {
  const { year, month, day } = dateParts(dateText);
  return `${month}/${day}/${String(year).slice(-2)}`;
}
