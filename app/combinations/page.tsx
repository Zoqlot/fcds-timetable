import { supabase } from "@/lib/supabase/client";
import CombinationsGenerator from "@/components/combinations/CombinationsGenerator";

export const revalidate = 3600;

export default async function CombinationsPage() {
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

  const catalogIds = Array.from(
    new Set(
      rows
        .map((r: any) => r.courses?.catalog_course_id)
        .filter(Boolean)
    )
  );

  let catalogMap: Record<string, any> = {};
  let programRuleMap: Record<string, any[]> = {};

  if (catalogIds.length) {
    const [{ data: catalogCourses }, { data: programRules }] = await Promise.all([
      supabase
        .from("course_catalog")
        .select("id, credit_hours, catalog_category, schedule_code")
        .in("id", catalogIds),
      supabase
        .from("v_program_courses")
        .select(`
          course_catalog_id,
          academic_level,
          group_code,
          group_name,
          requirement_status,
          credit_hours
        `)
        .eq("program_code", "01")
        .in("course_catalog_id", catalogIds),
    ]);

    catalogMap = Object.fromEntries(
      (catalogCourses ?? []).map((c: any) => [c.id, c])
    );

    for (const rule of programRules ?? []) {
      const current = programRuleMap[rule.course_catalog_id] ?? [];
      current.push(rule);
      programRuleMap[rule.course_catalog_id] = current;
    }
  }

  const enrichedCourses = rows.map((row: any) => {
    const catalogId = row.courses?.catalog_course_id;
    const rules = programRuleMap[catalogId] ?? [];

    // Prefer a required rule when a catalog course has more than one
    // curriculum row; otherwise use the first available rule.
    const primaryRule =
      rules.find((rule: any) => rule.requirement_status === "required") ??
      rules[0] ??
      null;

    return {
      ...row,
      credit_hours: catalogMap[catalogId]?.credit_hours ?? null,
      catalog_category:
        catalogMap[catalogId]?.catalog_category ?? null,
      academic_level: primaryRule?.academic_level ?? null,
      requirement_status: primaryRule?.requirement_status ?? null,
      group_code: primaryRule?.group_code ?? null,
      group_name: primaryRule?.group_name ?? null,
      program_rules: rules,
    };
  });

  return (
    <div className="flex h-screen w-full overflow-hidden bg-zinc-50 font-sans">
      <CombinationsGenerator
        semesterName={activeSemester.display_name}
        semesterCourses={enrichedCourses}
        // Wire these to the student's academic record when available.
        completedCourseIds={undefined}
        gpa={null}
        initialLoadError={error?.message ?? null}
      />
    </div>
  );
}
