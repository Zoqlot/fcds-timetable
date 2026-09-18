import { supabase } from '@/lib/supabase/client';
import TimetableBuilder from '@/components/timetable/TimetableBuilder';

export const revalidate = 3600; 

export default async function BuildTimetablePage() {
  const { data: activeSemester } = await supabase
    .from('semesters')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!activeSemester) {
    return <div className="h-screen flex items-center justify-center">No published semester found.</div>;
  }

  // Fetch courses with their available tracks AND eligible years
  const { data: semesterCourses } = await supabase
    .from('semester_courses')
    .select(`
      id,
      source_code,
      source_name,
      courses ( name ),
      offerings ( track, eligible_years )
    `)
    .eq('semester_id', activeSemester.id)
    .order('source_name', { ascending: true });

  return (
    <div className="flex h-screen w-full bg-zinc-50 overflow-hidden font-sans">
      <TimetableBuilder 
        semesterName={activeSemester.display_name} 
        semesterCourses={semesterCourses || []} 
      />
    </div>
  );
}