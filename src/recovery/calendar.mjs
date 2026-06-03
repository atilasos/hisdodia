const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function formatStoryId(month, day) {
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function buildDayInventory() {
  return DAYS_IN_MONTH.flatMap((daysInMonth, monthIndex) => {
    const month = monthIndex + 1;
    return Array.from({ length: daysInMonth }, (_, dayIndex) => {
      const day = dayIndex + 1;
      return { month, day, id: formatStoryId(month, day) };
    });
  });
}

export function isLeapDay(day) {
  return day.month === 2 && day.day === 29;
}
