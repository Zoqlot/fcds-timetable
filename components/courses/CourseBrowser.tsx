"use client";

import { useMemo, useState } from 'react';
import { Search, Plus, ChevronUp, ChevronDown, BookOpen, Check, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import SectionSelector from './SectionSelector';
import { TimetableEntry } from '../timetable/TimetableBuilder';

const MAX_SUBJECTS = 7;
const NORMAL_MAX_CREDITS = 19;
const EXTENDED_MAX_CREDITS = 21;
const EXTENDED_GPA_THRESHOLD = 3.333;

export default function CourseBrowser({ 
  semesterCourses, track, setTrack, timetable, setTimetable 
}: { 
  semesterCourses: any[], track: string, setTrack: (t: string) => void,
  timetable: TimetableEntry[], setTimetable: any 
}) {
  const [search, setSearch] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<any | null>(null);
  const [expandedYears, setExpandedYears] = useState<Record<number, boolean>>({ 1: true, 2: true, 3: true, 4: true });
  const [extendedLoadApproved, setExtendedLoadApproved] = useState(false);
  
  const tracks = ['GN', 'CY', 'AI', 'BA'];
  const levels = [1, 2, 3, 4];

  const toggleYear = (year: number) => {
    setExpandedYears(prev => ({ ...prev, [year]: !prev[year] }));
  };

  const courseMeta = useMemo(() => {
    const map = new Map<string, any>();
    for (const row of semesterCourses) {
      map.set(row.id, {
        semesterCourseId: row.id,
        catalogCourseId: row.courses?.catalog_course_id ?? null,
        name: row.courses?.name ?? row.source_name ?? "Unnamed course",
        code: row.source_code ?? row.courses?.code ?? "",
        creditHours: Number(row.credit_hours ?? row.courses?.credit_hours ?? 0),
        academicLevel: Number(row.academic_level ?? row.program_rules?.[0]?.academic_level ?? 0) || null,
        requirementStatus: row.requirement_status ?? row.program_rules?.[0]?.requirement_status ?? null,
        groupCode: row.group_code ?? row.program_rules?.[0]?.group_code ?? null,
        groupName: row.group_name ?? row.program_rules?.[0]?.group_name ?? null,
        catalogCategory: row.catalog_category ?? null,
      });
    }
    return map;
  }, [semesterCourses]);

  const getCourseYear = (row: any) => {
    const meta = courseMeta.get(row.id);
    if (meta?.academicLevel) return meta.academicLevel;

    const eligibleYears = (row.offerings ?? [])
      .filter((off: any) => off.track === track)
      .flatMap((off: any) => off.eligible_years ?? [])
      .map((year: any) => Number(year))
      .filter((year: number) => Number.isFinite(year) && year > 0);

    return eligibleYears.length ? Math.min(...eligibleYears) : 0;
  };

  const getSubjectType = (row: any) => {
    const meta = courseMeta.get(row.id);
    const required = meta?.requirementStatus === "required";

    if (required) {
      return { key: "required", title: "Program Requirement", arabic: "اجباري", order: 0 };
    }

    const source = String(meta?.groupName ?? meta?.catalogCategory ?? "").toLowerCase().replace(/[_-]+/g, " ");

    if (source.includes("requirement") || source.includes("required")) {
      return { key: "required", title: "Program Requirement", arabic: "اجباري", order: 0 };
    }
    if (source.includes("faculty") && source.includes("elective")) {
      return { key: "faculty_elective", title: "Faculty Elective", arabic: "اختياري", order: 1 };
    }
    if (source.includes("data science") && source.includes("elective")) {
      return { key: "ds_elective", title: "Data Science Elective", arabic: "اختياري", order: 1 };
    }
    if (source.includes("university") && source.includes("elective")) {
      return { key: "university_elective", title: "University Elective", arabic: "اختياري", order: 1 };
    }
    if (source.includes("elective") || source.includes("optional")) {
      return { key: "elective", title: "Elective", arabic: "اختياري", order: 1 };
    }

    return { key: "required", title: "Program Requirement", arabic: "اجباري", order: 0 };
  };

  const availableCourses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return semesterCourses
      .filter((row: any) => (row.offerings ?? []).some((o: any) => o.track === track))
      .filter((row: any) => {
        if (!q) return true;
        const name = String(row.courses?.name ?? row.source_name ?? "").toLowerCase();
        const code = String(row.source_code ?? row.courses?.code ?? "").toLowerCase();
        return name.includes(q) || code.includes(q);
      });
  }, [semesterCourses, search, track]);

  const coursesByYear = useMemo(() => {
    const grouped = new Map<number, any[]>();

    for (const row of availableCourses) {
      const year = getCourseYear(row);
      if (!year) continue;
      const list = grouped.get(year) ?? [];
      list.push(row);
      grouped.set(year, list);
    }

    for (const [year, rows] of grouped.entries()) {
      rows.sort((a: any, b: any) => {
        const typeA = getSubjectType(a);
        const typeB = getSubjectType(b);
        if (typeA.order !== typeB.order) return typeA.order - typeB.order;

        const typeCompare = typeA.title.localeCompare(typeB.title);
        if (typeCompare !== 0) return typeCompare;

        const codeA = String(a.source_code ?? a.courses?.code ?? "");
        const codeB = String(b.source_code ?? b.courses?.code ?? "");
        const codeCompare = codeA.localeCompare(codeB, undefined, { numeric: true });
        if (codeCompare !== 0) return codeCompare;

        return String(a.courses?.name ?? a.source_name ?? "").localeCompare(
          String(b.courses?.name ?? b.source_name ?? "")
        );
      });
      grouped.set(year, rows);
    }

    return grouped;
  }, [availableCourses, courseMeta, track]);

  const selectedCredits = useMemo(() => {
    let sum = 0;
    for (const entry of timetable) {
      sum += courseMeta.get(entry.course_id)?.creditHours ?? (entry as any).credit_hours ?? 0;
    }
    return sum;
  }, [timetable, courseMeta]);

  return (
    <div className="flex flex-col h-full w-full bg-white border-r border-zinc-200 overflow-hidden">
      
      <div className="p-4 sm:p-5 border-b border-zinc-100 space-y-4 shrink-0 bg-white">
        
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-violet-500" />
              <span className="text-xs font-black text-zinc-700">Semester load</span>
            </div>
            <span className="text-xs font-black text-zinc-500">{timetable.length}/{MAX_SUBJECTS} • {selectedCredits} cr</span>
          </div>
          <div className="h-2 bg-zinc-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${selectedCredits > NORMAL_MAX_CREDITS ? "bg-amber-500" : "bg-violet-500"}`}
              style={{ width: `${Math.min(100, (selectedCredits / EXTENDED_MAX_CREDITS) * 100)}%` }}
            />
          </div>
          
          {selectedCredits >= NORMAL_MAX_CREDITS && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-2 animate-in fade-in duration-300">
              <div className="text-[11px] font-bold text-amber-900 leading-tight">
                Exceeding limit ({NORMAL_MAX_CREDITS} cr) requires GPA &gt; {EXTENDED_GPA_THRESHOLD}.
              </div>
              {!extendedLoadApproved ? (
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setExtendedLoadApproved(true)}
                  className="w-full bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100 font-bold text-xs h-8 rounded-lg shadow-sm transition-colors"
                >
                  Unlock 21 Credits (GPA &gt; {EXTENDED_GPA_THRESHOLD})
                </Button>
              ) : (
                <div className="flex items-center justify-center gap-1.5 text-emerald-700 font-bold text-xs bg-emerald-50 border border-emerald-200 rounded-lg h-8">
                  <Check className="h-4 w-4" /> 21 Credits Unlocked
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 block">Specialization Track</label>
          <div className="grid grid-cols-4 gap-2">
            {tracks.map(t => (
              <button
                key={t}
                onClick={() => setTrack(t)}
                className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                  track === t 
                    ? 'bg-violet-600 text-white border-violet-600 shadow-md' 
                    : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
          <input 
            type="text" 
            placeholder="Search subjects..." 
            className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-zinc-50/30 pb-28">
        {levels.map(level => {
          const coursesInLevel = coursesByYear.get(level) ?? [];
          if (coursesInLevel.length === 0) return null;

          const typeGroups = new Map<string, { meta: ReturnType<typeof getSubjectType>; rows: any[] }>();

          for (const row of coursesInLevel) {
            const meta = getSubjectType(row);
            const current = typeGroups.get(meta.key);
            if (current) current.rows.push(row);
            else typeGroups.set(meta.key, { meta, rows: [row] });
          }

          const orderedGroups = Array.from(typeGroups.values()).sort((a, b) => a.meta.order - b.meta.order);

          return (
            <div key={level} className="mb-7">
              <button 
                onClick={() => toggleYear(level)}
                className="flex items-center justify-between w-full pb-2.5 mb-3 border-b border-zinc-200 group px-1"
              >
                <div className="flex items-center gap-2">
                  <span className="h-7 w-7 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center text-[11px] font-black">
                    {level}
                  </span>
                  <h3 className="text-sm font-black text-zinc-800 tracking-wide group-hover:text-violet-600 transition-colors">
                    YEAR {level}
                  </h3>
                </div>
                {expandedYears[level] ? (
                  <ChevronUp className="h-4 w-4 text-zinc-400 group-hover:text-violet-600" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-zinc-400 group-hover:text-violet-600" />
                )}
              </button>

              {expandedYears[level] && (
                <div className="space-y-5 animate-in slide-in-from-top-2 fade-in duration-200">
                  {orderedGroups.map(({ meta, rows }) => (
                    <div key={meta.key}>
                      <div className={`flex items-center gap-2 px-2 mb-2 ${meta.order === 0 ? "text-violet-700" : "text-amber-700"}`}>
                        <div className={`h-1.5 w-1.5 rounded-full ${meta.order === 0 ? "bg-violet-500" : "bg-amber-500"}`} />
                        <span className="text-[11px] font-black uppercase tracking-[0.12em]">
                          {meta.title}
                        </span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${meta.order === 0 ? "bg-violet-100 text-violet-700" : "bg-amber-100 text-amber-700"}`}>
                          ({meta.arabic})
                        </span>
                        <span className="text-[10px] font-bold text-zinc-400 ml-auto">
                          {rows.length} subject{rows.length === 1 ? "" : "s"}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {rows.map((sc: any) => {
                          const isSelected = timetable.some((t: any) => t.course_id === sc.id);
                          const credits = courseMeta.get(sc.id)?.creditHours ?? Number(sc.credit_hours ?? 0);

                          return (
                            <Card 
                              key={sc.id} 
                              onClick={() => setSelectedCourse(sc)}
                              className={`p-3.5 hover:shadow-md cursor-pointer transition-all group active:scale-[0.99] ${isSelected ? 'border-violet-300 bg-violet-50 shadow-sm' : 'border-zinc-200 hover:border-violet-300'}`}
                            >
                              <div className="flex justify-between items-start gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-black text-violet-600 tracking-widest uppercase">
                                      {sc.source_code || "MATH0 / ELEC"}
                                    </span>
                                    <span className="text-[10px] font-black text-zinc-400">
                                      {credits} cr
                                    </span>
                                  </div>
                                  <h3 className={`font-semibold text-sm leading-tight transition-colors ${isSelected ? 'text-violet-900' : 'text-zinc-800 group-hover:text-violet-700'}`}>
                                    {sc.courses?.name ?? sc.source_name}
                                  </h3>
                                </div>
                                <button className={`h-7 w-7 flex-shrink-0 rounded-full flex items-center justify-center transition-colors ${isSelected ? 'bg-violet-600 text-white' : 'bg-zinc-100 text-zinc-500 group-hover:bg-violet-600 group-hover:text-white'}`}>
                                  {isSelected ? <CheckCircle2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                </button>
                              </div>
                            </Card>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {availableCourses.length === 0 && (
          <div className="text-center text-zinc-500 py-10 text-sm">No courses available for {track}.</div>
        )}
      </div>

      <SectionSelector 
        course={selectedCourse} 
        isOpen={!!selectedCourse} 
        onClose={() => setSelectedCourse(null)} 
        track={track}
        timetable={timetable}
        setTimetable={setTimetable}
      />
    </div>
  );
}