import { supabase } from "@/lib/supabase/client";
import TimetableBuilder from "@/components/timetable/TimetableBuilder";

export const revalidate = 3600;

export default async function BuildPage() {
  const { data: activeSemester } = await supabase
    .from("semesters")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!activeSemester) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 text-zinc-500">
        No published semester found.
      </div>
    );
  }

  const { data: semesterCourses, error } = await supabase
    .from("semester_courses")
    .select(`
      id,
      source_code,
      source_name,
      courses (
        id,
        code,
        name,
        catalog_course_id
      ),
      offerings ( track, eligible_years )
    `)
    .eq("semester_id", activeSemester.id)
    .order("source_name", { ascending: true });

  const rows = semesterCourses ?? [];
  
  // Extract catalog IDs to fetch credit hours and categories
  const catalogIds = Array.from(
    new Set(rows.map((r: any) => r.courses?.catalog_course_id).filter(Boolean))
  );

  let catalogMap: Record<string, any> = {};

  if (catalogIds.length) {
    const { data: catalogCourses } = await supabase
      .from("course_catalog")
      .select("id, credit_hours, catalog_category, schedule_code")
      .in("id", catalogIds);

    catalogMap = Object.fromEntries(
      (catalogCourses ?? []).map((c: any) => [c.id, c])
    );
  }

  // Enrich the courses with the missing DB data
  const enrichedCourses = rows.map((row: any) => ({
    ...row,
    credit_hours: catalogMap[row.courses?.catalog_course_id]?.credit_hours ?? null,
    catalog_category: catalogMap[row.courses?.catalog_course_id]?.catalog_category ?? null,
  }));

  return (
    <div className="flex h-screen w-full overflow-hidden bg-zinc-50 font-sans">
      <TimetableBuilder
        semesterName={activeSemester.display_name}
        semesterCourses={enrichedCourses}
      />
    </div>
  );
}