export const DEFAULT_SCHOOL_YEAR_START_DATE = "2026-09-06";

export function settingDate(value, fallback = "") {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  return value.date || value.deadline || value.text || fallback;
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

export function formatShortDate(dateText) {
  const { year, month, day } = dateParts(dateText);
  return `${month}/${day}/${String(year).slice(-2)}`;
}
