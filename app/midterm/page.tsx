import { supabase } from "@/lib/supabase/client";
import MidtermPlanner from "@/components/midterm/MidtermPlanner";
import type { MidtermExam } from "@/lib/midterm/types";

export const revalidate = 300;

export default async function MidtermPage() {
  const { data: session, error } = await supabase
    .from("midterm_exam_sessions")
    .select("id, academic_year, term, display_name, status, created_at, midterm_subjects ( id, course_code, course_name, year_level, midterm_exams ( id, exam_date, start_time, end_time ) )")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <div className="max-w-md rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">✦</div>
          <h1 className="mt-4 text-xl font-black text-zinc-900">Midterm timetable unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            There is no published midterm timetable right now. Please check again when the faculty publishes the exam schedule.
          </p>
        </div>
      </main>
    );
  }

  const rawSession = session as unknown as {
    id: string;
    display_name: string;
    midterm_subjects: {
      id: string;
      course_code: string;
      course_name: string;
      year_level: number | null;
      midterm_exams: {
        id: string;
        exam_date: string;
        start_time: string;
        end_time: string;
      }[];
    }[];
  };

  const exams: MidtermExam[] = (rawSession.midterm_subjects ?? []).flatMap((subject) =>
    (subject.midterm_exams ?? []).map((exam) => ({
      id: exam.id,
      subjectId: subject.id,
      courseCode: subject.course_code ?? "",
      courseName: subject.course_name ?? "Unnamed subject",
      yearLevel: subject.year_level ?? null,
      date: String(exam.exam_date).slice(0, 10),
      startTime: String(exam.start_time).slice(0, 5),
      endTime: String(exam.end_time).slice(0, 5),
    }))
  );

  exams.sort((a, b) =>
    a.date.localeCompare(b.date) ||
    a.startTime.localeCompare(b.startTime) ||
    a.courseName.localeCompare(b.courseName)
  );

  return (
    <MidtermPlanner
      sessionId={rawSession.id}
      sessionName={rawSession.display_name}
      exams={exams}
    />
  );
}
