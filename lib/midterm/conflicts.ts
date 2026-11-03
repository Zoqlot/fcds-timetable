import type { MidtermExam } from "./types";

export type ExamConflict = {
  first: MidtermExam;
  second: MidtermExam;
};

export function findExamConflicts(exams: MidtermExam[]): ExamConflict[] {
  const conflicts: ExamConflict[] = [];
  const sorted = [...exams].sort((a, b) =>
    a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)
  );

  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const first = sorted[i];
      const second = sorted[j];
      if (first.date !== second.date) break;
      if (first.startTime < second.endTime && second.startTime < first.endTime) {
        conflicts.push({ first, second });
      }
    }
  }
  return conflicts;
}

export function sortExams(
  exams: MidtermExam[],
  order: "chronological" | "alphabetical" | "manual",
  manualIds: string[]
): MidtermExam[] {
  const copy = [...exams];
  if (order === "alphabetical") {
    return copy.sort((a, b) => a.courseName.localeCompare(b.courseName));
  }
  if (order === "manual") {
    const positions = new Map(manualIds.map((id, index) => [id, index]));
    return copy.sort((a, b) =>
      (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );
  }
  return copy.sort((a, b) =>
    a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) ||
    a.courseName.localeCompare(b.courseName)
  );
}

export function dayLabel(date: string, options: Intl.DateTimeFormatOptions = {
  weekday: "long", month: "short", day: "numeric"
}) {
  const parsed = new Date(date + "T12:00:00");
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en", options).format(parsed);
}

export function timeLabel(time: string) {
  const [hourText, minute] = time.slice(0, 5).split(":");
  const hour = Number(hourText);
  if (!Number.isFinite(hour)) return time;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return displayHour + ":" + (minute || "00") + " " + suffix;
}