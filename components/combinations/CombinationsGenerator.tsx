"use client";

import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  AlertCircle,
  BookOpen,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  CircleAlert,
  Loader2,
  Palette,
  Search,
  Square,
  Wand2,
  Download,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import TimetableGrid from "../timetable/TimetableGrid";
import { TimetableEntry } from "../timetable/TimetableBuilder";

export type TimetableTheme = {
  backgroundColor: string;
  columnHeaderColor: string;
  rowHeaderColor: string;
  lectureColor: string;
  sectionColor: string;
};

const PRESET_THEMES: Record<string, TimetableTheme> = {
  purple: { backgroundColor: "#c7bfe6", columnHeaderColor: "#a399ce", rowHeaderColor: "#b5abd9", lectureColor: "#8e7cc3", sectionColor: "#a294d1" },
  peach: { backgroundColor: "#fcd5cb", columnHeaderColor: "#f4b2a3", rowHeaderColor: "#f7c1b5", lectureColor: "#ea9999", sectionColor: "#f2a89b" },
  orange: { backgroundColor: "#f9cb9c", columnHeaderColor: "#f6b26b", rowHeaderColor: "#f7bc80", lectureColor: "#e69138", sectionColor: "#f3a558" },
  classic: { backgroundColor: "#cfe2f3", columnHeaderColor: "#9fc5e8", rowHeaderColor: "#b4d5f0", lectureColor: "#6fa8dc", sectionColor: "#8ebfe8" },
};

const MAX_SUBJECTS = 7;
const MAX_CREDITS_PER_COURSE = 3;
const NORMAL_MAX_CREDITS = 19;
const EXTENDED_MAX_CREDITS = 21;
const EXTENDED_GPA_THRESHOLD = 3.333;
const MAX_RESULTS = 5000;

type Meeting = {
  day: string;
  period: number | string;
  start_time?: string;
  end_time?: string;
  location?: string;
  instructor?: string;
};

type Choice = {
  id: string;
  label: string;
  meetings: Meeting[];
  inheritedFromGroup?: number;
};

type Props = {
  semesterName: string;
  semesterCourses: any[];
  completedCourseIds?: string[];
  gpa?: number | null;
  initialLoadError?: string | null;
};

const normalizeType = (value?: string) => value === "section" ? "practical" : value;

function timeToMinutes(value?: string) {
  if (!value) return null;
  const [h, m] = value.slice(0, 5).split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

function meetingsOverlap(a: Meeting, b: Meeting) {
  if (a.day !== b.day) return false;

  const aStart = timeToMinutes(a.start_time);
  const aEnd = timeToMinutes(a.end_time);
  const bStart = timeToMinutes(b.start_time);
  const bEnd = timeToMinutes(b.end_time);

  if (aStart !== null && aEnd !== null && bStart !== null && bEnd !== null) {
    return aStart < bEnd && bStart < aEnd;
  }

  return Number(a.period) === Number(b.period);
}

function hasConflict(a: Meeting[], b: Meeting[]) {
  return a.some((m1) => b.some((m2) => meetingsOverlap(m1, m2)));
}

function dedupeChoices(choices: Choice[]) {
  const seen = new Set<string>();
  return choices.filter((choice) => {
    const key = choice.meetings
      .map((m) => `${m.day}|${m.period}|${m.start_time}|${m.end_time}|${m.location}|${m.instructor}`)
      .sort()
      .join("||");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildComponentChoices(offering: any, component: any, groupNumber: number): Choice[] {
  const type = normalizeType(component.component_type);
  const options = (component.options ?? []).filter((o: any) => (o.meetings ?? []).length);
  if (!options.length) return [];

  if (component.selection_mode === "all") {
    return [{
      id: `${groupNumber}__${type}__${offering.id}__all`,
      label: component.label || (type === "lecture" ? "Lecture" : "Required sessions"),
      meetings: options.flatMap((o: any) => o.meetings ?? []),
    }];
  }

  return dedupeChoices(options.map((o: any, index: number) => ({
    id: `${groupNumber}__${type}__${offering.id}__${o.id}`,
    label: o.raw_option_label || o.name || `${type === "lecture" ? "Lecture" : "Section"} ${index + 1}`,
    meetings: o.meetings ?? [],
  })));
}

function combineChoiceLists(lists: Choice[][]) {
  if (!lists.length) return [];

  let result: Choice[] = [{ id: "base", label: "", meetings: [] }];
  for (const list of lists) {
    if (!list.length) continue;
    const next: Choice[] = [];

    for (const partial of result) {
      for (const choice of list) {
        if (hasConflict(partial.meetings, choice.meetings)) continue;
        next.push({
          id: `${partial.id}__${choice.id}`,
          label: [partial.label, choice.label].filter(Boolean).join(" • "),
          meetings: [...partial.meetings, ...choice.meetings],
          inheritedFromGroup: choice.inheritedFromGroup ?? partial.inheritedFromGroup,
        });
      }
    }

    result = next;
  }

  return result;
}

export default function CombinationsGenerator({
  semesterName,
  semesterCourses,
  completedCourseIds,
  gpa,
  initialLoadError,
}: Props) {
  const [track, setTrack] = useState("GN");
  const [search, setSearch] = useState("");
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(new Set());
  const [generatedSchedules, setGeneratedSchedules] = useState<TimetableEntry[][]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [theme, setTheme] = useState<TimetableTheme>(PRESET_THEMES.purple);
  const [extendedLoadApproved, setExtendedLoadApproved] = useState(false);
  
  const [dayFilter, setDayFilter] = useState<number | 'all'>('all');
  const [expandedYears, setExpandedYears] = useState<Record<number, boolean>>({ 1: true, 2: true, 3: true, 4: true });
  const levels = [1, 2, 3, 4];

  const toggleYear = (year: number) => {
    setExpandedYears(prev => ({ ...prev, [year]: !prev[year] }));
  };

  const completedSet = useMemo(() => new Set(completedCourseIds ?? []), [completedCourseIds]);

  const courseMeta = useMemo(() => {
    const map = new Map<string, any>();
    for (const row of semesterCourses) {
      map.set(row.id, {
        semesterCourseId: row.id,
        catalogCourseId: row.courses?.catalog_course_id ?? null,
        name: row.courses?.name ?? row.source_name ?? "Unnamed course",
        code: row.source_code ?? row.courses?.code ?? "",
        creditHours: Number(row.credit_hours ?? 0),
      });
    }
    return map;
  }, [semesterCourses]);

  const availableCourses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return semesterCourses
      .filter((row: any) => (row.offerings ?? []).some((o: any) => o.track === track))
      .filter((row: any) => {
        if (!q) return true;
        const name = String(row.courses?.name ?? row.source_name ?? "").toLowerCase();
        const code = String(row.source_code ?? row.courses?.code ?? "").toLowerCase();
        return name.includes(q) || code.includes(q);
      })
      .sort((a: any, b: any) => String(a.courses?.name ?? a.source_name).localeCompare(String(b.courses?.name ?? b.source_name)));
  }, [semesterCourses, search, track]);

  const selectedCredits = useMemo(() => {
    let sum = 0;
    for (const id of selectedCourseIds) sum += courseMeta.get(id)?.creditHours ?? 0;
    return sum;
  }, [selectedCourseIds, courseMeta]);

  const uniqueDayCounts = useMemo(() => {
    if (!generatedSchedules.length) return [];
    const counts = new Set<number>();
    generatedSchedules.forEach(sched => {
      const days = new Set(sched.flatMap(e => e.meetings.map(m => m.day)));
      counts.add(days.size);
    });
    return Array.from(counts).sort((a, b) => a - b);
  }, [generatedSchedules]);

  const displayedSchedules = useMemo(() => {
    if (dayFilter === 'all') return generatedSchedules;
    return generatedSchedules.filter(sched => {
      const days = new Set(sched.flatMap(e => e.meetings.map(m => m.day)));
      return days.size === dayFilter;
    });
  }, [generatedSchedules, dayFilter]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [dayFilter, generatedSchedules]);

  function canUseExtendedLoad(nextCredits: number) {
    if (nextCredits <= NORMAL_MAX_CREDITS) return true;
    if (nextCredits > EXTENDED_MAX_CREDITS) return false;
    if (gpa !== null && gpa !== undefined && gpa > EXTENDED_GPA_THRESHOLD) return true;
    if (extendedLoadApproved) return true;
    return false;
  }

  function toggleCourse(id: string) {
    setMessage(null);

    if (selectedCourseIds.has(id)) {
      const next = new Set(selectedCourseIds);
      next.delete(id);
      setSelectedCourseIds(next);
      return;
    }

    if (selectedCourseIds.size >= MAX_SUBJECTS) {
      setMessage(`You can select at most ${MAX_SUBJECTS} subjects.`);
      return;
    }

    const meta = courseMeta.get(id);
    if (!meta) {
      setMessage("This subject is missing catalog information.");
      return;
    }

    if (meta.creditHours > MAX_CREDITS_PER_COURSE) {
      setMessage(`${meta.name} is ${meta.creditHours} credits. The planner allows at most ${MAX_CREDITS_PER_COURSE} credits per subject.`);
      return;
    }

    const nextCredits = selectedCredits + meta.creditHours;
    if (nextCredits > EXTENDED_MAX_CREDITS) {
      setMessage(`That would exceed the ${EXTENDED_MAX_CREDITS}-credit maximum.`);
      return;
    }

    if (nextCredits > NORMAL_MAX_CREDITS && !canUseExtendedLoad(nextCredits)) {
      setMessage(`Exceeding ${NORMAL_MAX_CREDITS} credits requires extended load approval below.`);
      return;
    }

    const next = new Set(selectedCourseIds);
    next.add(id);
    setSelectedCourseIds(next);
  }

  async function loadPrerequisiteState(selectedIds: string[]) {
    if (completedCourseIds === undefined) return new Map<string, string[]>();
    const catalogIds = selectedIds
      .map((id) => courseMeta.get(id)?.catalogCourseId)
      .filter(Boolean);

    if (!catalogIds.length) return new Map<string, string[]>();

    const { data: prereqs, error } = await supabase
      .from("course_prerequisites")
      .select("course_id, prerequisite_course_id")
      .in("course_id", catalogIds)
      .eq("is_enforced", true);

    if (error) throw error;

    const missingByCourse = new Map<string, string[]>();
    for (const row of prereqs ?? []) {
      if (completedSet.has(row.prerequisite_course_id)) continue;
      const current = missingByCourse.get(row.course_id) ?? [];
      current.push(row.prerequisite_course_id);
      missingByCourse.set(row.course_id, current);
    }

    return missingByCourse;
  }

  async function loadPrerequisiteNames(ids: string[]) {
    if (!ids.length) return [];
    const { data, error } = await supabase.from("course_catalog").select("id, name, schedule_code").in("id", ids);
    if (error) throw error;
    return data ?? [];
  }

  function buildCourseConfigs(courseId: string, offerings: any[]) {
    const meta = courseMeta.get(courseId);
    if (!meta) return [];

    const totals = offerings.map((o) => Number(o.group_total)).filter((n) => Number.isFinite(n) && n > 0);
    const groupTotal = totals.length
      ? Math.max(...totals)
      : Math.max(0, ...offerings.map((o) => Number(o.group_number)).filter((n) => Number.isFinite(n)));

    const groups = groupTotal > 0
      ? Array.from({ length: groupTotal }, (_, i) => i + 1)
      : [0];

    const configs: TimetableEntry[] = [];
    const lecturePools = new Map<number, Choice[]>();
    const sectionPools = new Map<number, Choice[]>();

    for (const groupNumber of groups) {
      const matching = offerings.filter((o) => groupNumber === 0 || Number(o.group_number) === groupNumber);

      const lectureLists = matching.flatMap((o) =>
        (o.components ?? [])
          .filter((c: any) => normalizeType(c.component_type) === "lecture")
          .map((c: any) => buildComponentChoices(o, c, groupNumber))
      );

      const sectionLists = matching.flatMap((o) =>
        (o.components ?? [])
          .filter((c: any) => normalizeType(c.component_type) === "practical")
          .map((c: any) => buildComponentChoices(o, c, groupNumber))
      );

      lecturePools.set(groupNumber, combineChoiceLists(lectureLists));
      sectionPools.set(groupNumber, combineChoiceLists(sectionLists));
    }

    for (const groupNumber of groups) {
      let lectures = lecturePools.get(groupNumber) ?? [];
      const sections = sectionPools.get(groupNumber) ?? [];

      if (!lectures.length) {
        const inherited: Choice[] = [];
        for (const sourceGroup of groups) {
          if (sourceGroup === groupNumber) continue;
          for (const lecture of lecturePools.get(sourceGroup) ?? []) {
            inherited.push({
              ...lecture,
              id: `${groupNumber}__fallback__${sourceGroup}__${lecture.id}`,
              label: `${lecture.label || "Lecture"} • shared from Group ${sourceGroup}`,
              inheritedFromGroup: sourceGroup,
            });
          }
        }
        lectures = dedupeChoices(inherited);
      }

      if (!lectures.length) continue;

      const usableSections: Choice[] = sections.length
        ? sections
        : [{ id: `${groupNumber}__none`, label: "No section required", meetings: [] }];

      for (const lecture of lectures) {
        for (const section of usableSections) {
          if (hasConflict(lecture.meetings, section.meetings)) continue;
          configs.push({
            course_id: courseId,
            course_name: meta.name,
            offering_id: `logical-group-${groupNumber}`,
            meetings: [...lecture.meetings, ...section.meetings],
            group_number: groupNumber,
          } as any);
        }
      }
    }

    const unique = new Map<string, TimetableEntry>();
    for (const config of configs) {
      const signature = config.meetings
        .map((m: any) => `${m.day}|${m.period}|${m.start_time}|${m.end_time}|${m.location}|${m.instructor}`)
        .sort()
        .join("||");
      if (!unique.has(signature)) unique.set(signature, config);
    }

    return Array.from(unique.values());
  }

  async function handleGenerate() {
    setMessage(null);
    setHasGenerated(true);
    setLoading(true);
    setGeneratedSchedules([]);
    setDayFilter('all');
    setCurrentIndex(0);

    try {
      const selectedIds = Array.from(selectedCourseIds);
      if (!selectedIds.length) throw new Error("Select at least one subject.");
      if (selectedIds.length > MAX_SUBJECTS) throw new Error(`You can select at most ${MAX_SUBJECTS} subjects.`);
      if (selectedCredits > EXTENDED_MAX_CREDITS) throw new Error(`The maximum load is ${EXTENDED_MAX_CREDITS} credits.`);
      if (selectedCredits > NORMAL_MAX_CREDITS && !canUseExtendedLoad(selectedCredits)) {
        throw new Error(`GPA must be higher than ${EXTENDED_GPA_THRESHOLD} to use more than ${NORMAL_MAX_CREDITS} credits.`);
      }

      const missingPrerequisites = await loadPrerequisiteState(selectedIds);
      const blocked: string[] = [];

      for (const [catalogId, missingIds] of missingPrerequisites.entries()) {
        const names = await loadPrerequisiteNames(missingIds);
        const course = Array.from(courseMeta.values()).find((m: any) => m.catalogCourseId === catalogId);
        blocked.push(`${course?.name ?? "Course"}: ${names.map((n: any) => n.name).join(", ")}`);
      }

      if (blocked.length) {
        throw new Error(`Prerequisites not passed: ${blocked.join(" • ")}`);
      }

      const { data: offerings, error } = await supabase
        .from("offerings")
        .select(`
          id,
          semester_course_id,
          track,
          raw_section_label,
          group_number,
          group_total,
          components:offering_components (
            id,
            component_type,
            selection_mode,
            label,
            sort_order,
            options:meeting_options (
              id,
              name,
              subgroups,
              raw_option_label,
              meetings (
                day,
                period,
                start_time,
                end_time,
                location,
                instructor
              )
            )
          )
        `)
        .in("semester_course_id", selectedIds)
        .eq("track", track)
        .order("group_number", { ascending: true });

      if (error) throw error;

      const byCourse = new Map<string, any[]>();
      for (const offering of offerings ?? []) {
        const list = byCourse.get(offering.semester_course_id) ?? [];
        list.push(offering);
        byCourse.set(offering.semester_course_id, list);
      }

      const configsByCourse = new Map<string, TimetableEntry[]>();
      const unavailable: string[] = [];

      for (const courseId of selectedIds) {
        const configs = buildCourseConfigs(courseId, byCourse.get(courseId) ?? []);
        if (!configs.length) {
          unavailable.push(courseMeta.get(courseId)?.name ?? "Course");
        } else {
          configsByCourse.set(courseId, configs);
        }
      }

      if (unavailable.length) {
        throw new Error(`No valid group/lecture/section configuration was found for: ${unavailable.join(", ")}.`);
      }

      const order = [...selectedIds].sort(
        (a, b) => (configsByCourse.get(a)?.length ?? 0) - (configsByCourse.get(b)?.length ?? 0)
      );

      let schedules: TimetableEntry[][] = [[]];

      for (const courseId of order) {
        const options = configsByCourse.get(courseId) ?? [];
        const next: TimetableEntry[][] = [];

        for (const schedule of schedules) {
          const occupied = schedule.flatMap((e) => e.meetings ?? []);
          for (const option of options) {
            if (hasConflict(occupied, option.meetings)) continue;
            next.push([...schedule, option]);
            if (next.length >= MAX_RESULTS) break;
          }
          if (next.length >= MAX_RESULTS) break;
        }

        schedules = next;
        if (!schedules.length) break;
      }

      setGeneratedSchedules(schedules);
      setCurrentIndex(0);

      if (!schedules.length) {
        setMessage("No conflict-free timetable exists for this exact subject selection.");
      } else if (schedules.length >= MAX_RESULTS) {
        setMessage(`There are more than ${MAX_RESULTS.toLocaleString()} valid combinations. Showing the first ${MAX_RESULTS.toLocaleString()}.`);
      }
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message ?? "Could not generate schedules.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
          body {
            background: white !important;
            color: black !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          aside, header, .no-print {
            display: none !important;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            height: auto !important;
            background: white !important;
          }
          .overflow-auto, .overflow-hidden, .overflow-y-auto {
            overflow: visible !important;
          }
        }
      `}</style>

      <aside className="w-[390px] shrink-0 h-full flex flex-col bg-white border-r border-zinc-200 shadow-[4px_0_24px_rgba(0,0,0,0.03)] z-10 no-print">
        <div className="p-5 border-b border-zinc-100 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-violet-600 text-white flex items-center justify-center shadow-lg shadow-violet-200">
              <Wand2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-zinc-900">Auto-Builder</h2>
              <p className="text-[11px] font-semibold text-zinc-400">Generate conflict-free timetable combinations</p>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-violet-500" />
                <span className="text-xs font-black text-zinc-700">Semester load</span>
              </div>
              <span className="text-xs font-black text-zinc-500">{selectedCourseIds.size}/{MAX_SUBJECTS} • {selectedCredits} cr</span>
            </div>
            <div className="h-2 bg-zinc-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${selectedCredits > NORMAL_MAX_CREDITS ? "bg-amber-500" : "bg-violet-500"}`}
                style={{ width: `${Math.min(100, (selectedCredits / EXTENDED_MAX_CREDITS) * 100)}%` }}
              />
            </div>
            
            {selectedCredits > NORMAL_MAX_CREDITS && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-2">
                <div className="text-[11px] font-bold text-amber-900 leading-tight">
                  Exceeds standard limit ({NORMAL_MAX_CREDITS} cr). Requires GPA &gt; {EXTENDED_GPA_THRESHOLD}.
                </div>
                {!extendedLoadApproved ? (
                  <Button 
                    size="sm" 
                    onClick={() => setExtendedLoadApproved(true)}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-8 rounded-lg shadow-sm"
                  >
                    Confirm GPA &gt; {EXTENDED_GPA_THRESHOLD}
                  </Button>
                ) : (
                  <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-xs pt-0.5">
                    <Check className="h-4 w-4" /> Extended load authorized
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {["GN", "CY", "AI", "BA"].map((value) => (
              <button
                key={value}
                onClick={() => {
                  setTrack(value);
                  setSelectedCourseIds(new Set());
                  setGeneratedSchedules([]);
                  setHasGenerated(false);
                  setMessage(null);
                  setExtendedLoadApproved(false);
                }}
                className={`py-2 rounded-xl text-xs font-black border transition-all ${track === value ? "bg-violet-600 text-white border-violet-600 shadow-md" : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"}`}
              >
                {value}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search subjects or codes..."
              className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-zinc-50/30">
          {levels.map(level => {
            const coursesInLevel = availableCourses.filter(sc => 
              sc.offerings?.some((off: any) => off.track === track && off.eligible_years?.includes(level))
            );

            if (coursesInLevel.length === 0) return null;

            return (
              <div key={level} className="mb-6">
                <button 
                  onClick={() => toggleYear(level)}
                  className="flex items-center justify-between w-full pb-2 mb-3 border-b border-zinc-200 group px-2"
                >
                  <h3 className="text-sm font-extrabold text-zinc-700 tracking-wide group-hover:text-violet-600 transition-colors">
                    YEAR {level}
                  </h3>
                  {expandedYears[level] ? (
                    <ChevronUp className="h-4 w-4 text-zinc-400 group-hover:text-violet-600" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-zinc-400 group-hover:text-violet-600" />
                  )}
                </button>

                {expandedYears[level] && (
                  <div className="space-y-1.5 animate-in slide-in-from-top-2 fade-in duration-200">
                    {coursesInLevel.map((row: any) => {
                      const selected = selectedCourseIds.has(row.id);
                      const credits = Number(row.credit_hours ?? 0);
                      const invalid = credits > MAX_CREDITS_PER_COURSE;

                      return (
                        <button
                          key={row.id}
                          disabled={invalid}
                          onClick={() => toggleCourse(row.id)}
                          className={`w-full text-left p-3 rounded-2xl border flex items-start gap-3 transition-all ${invalid ? "bg-zinc-100 border-zinc-200 opacity-60 cursor-not-allowed" : selected ? "bg-violet-50 border-violet-300 ring-1 ring-violet-200" : "bg-white border-zinc-200 hover:border-violet-300 hover:shadow-sm"}`}
                        >
                          <div className="pt-0.5">{selected ? <CheckSquare className="h-4 w-4 text-violet-600" /> : <Square className="h-4 w-4 text-zinc-300" />}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between gap-3">
                              <span className="text-[10px] font-black uppercase tracking-widest text-violet-600">{row.source_code || "MATH0 / ELEC"}</span>
                              <span className="text-[10px] font-black text-zinc-400">{credits} cr</span>
                            </div>
                            <div className={`text-sm font-black leading-tight mt-1 ${selected ? "text-violet-900" : "text-zinc-800"}`}>{row.courses?.name ?? row.source_name}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {!availableCourses.length && <div className="py-12 text-center text-sm font-semibold text-zinc-400">No subjects found for {track}.</div>}
        </div>

        <div className="p-4 bg-white border-t border-zinc-200">
          {initialLoadError && <div className="mb-3 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">Course data could not be fully loaded.</div>}
          {message && <div className="mb-3 text-xs font-semibold leading-relaxed text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">{message}</div>}
          <Button disabled={!selectedCourseIds.size || loading} onClick={handleGenerate} className="w-full h-12 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-black shadow-md shadow-violet-200">
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Computing...</> : <><Wand2 className="h-4 w-4 mr-2" /> Generate Schedules</>}
          </Button>
        </div>
      </aside>

      <main className="flex-1 h-full flex flex-col p-6 overflow-hidden bg-zinc-100 print:bg-white print:p-0">
        <div className="flex items-center justify-between gap-4 mb-4 no-print">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-zinc-900">Generated Combinations</h1>
              {displayedSchedules.length > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[10px] font-black text-emerald-700"><Check className="h-3 w-3" /> Conflict-free</span>}
            </div>
            <p className="text-zinc-500 font-medium text-xs mt-1">{semesterName} • {track} • {selectedCourseIds.size} subjects • {selectedCredits} credits</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            
            {generatedSchedules.length > 0 && uniqueDayCounts.length > 1 && (
              <div className="flex items-center bg-white border border-zinc-300 rounded-xl p-1 shadow-sm h-9">
                <span className="text-[10px] font-black text-zinc-400 pl-2 pr-2 uppercase tracking-wider">Days</span>
                <button 
                  onClick={() => setDayFilter('all')} 
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${dayFilter === 'all' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-600 hover:bg-zinc-100'}`}
                >
                  All
                </button>
                {uniqueDayCounts.map(count => (
                  <button 
                    key={count} 
                    onClick={() => setDayFilter(count)} 
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${dayFilter === count ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-600 hover:bg-zinc-100'}`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            )}

            {displayedSchedules.length > 0 && (
              <div className="flex items-center bg-white border border-zinc-300 rounded-xl p-1 shadow-sm h-9">
                <button disabled={currentIndex === 0} onClick={() => setCurrentIndex((i) => i - 1)} className="p-1.5 rounded-lg hover:bg-zinc-100 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
                <span className="text-[11px] font-black text-zinc-700 w-24 text-center">
                  {currentIndex + 1} / {displayedSchedules.length}
                </span>
                <button disabled={currentIndex === displayedSchedules.length - 1} onClick={() => setCurrentIndex((i) => i + 1)} className="p-1.5 rounded-lg hover:bg-zinc-100 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
              </div>
            )}

            {displayedSchedules.length > 0 && (
              <Button 
                variant="outline" 
                onClick={() => window.print()}
                className="inline-flex items-center justify-center rounded-xl text-xs font-black border border-zinc-300 bg-white text-zinc-700 shadow-sm hover:bg-zinc-100 h-9 px-3 gap-1.5"
              >
                <Download className="h-3.5 w-3.5 text-violet-600" /> Export PDF
              </Button>
            )}

            <Popover>
              <PopoverTrigger className="inline-flex items-center justify-center rounded-xl text-xs font-black border border-zinc-300 bg-white text-zinc-700 shadow-sm hover:bg-zinc-100 h-9 px-3 gap-1.5 cursor-pointer">
                <Palette className="h-3.5 w-3.5 text-violet-600" /> Colors
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4 bg-white rounded-2xl shadow-xl">
                <h4 className="font-black text-sm text-zinc-900 mb-3">Timetable theme</h4>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(PRESET_THEMES).map(([name, preset]) => (
                    <button key={name} onClick={() => setTheme(preset)} className="h-9 rounded-lg border border-zinc-200 text-[10px] font-black capitalize hover:scale-105 transition-transform" style={{ backgroundColor: preset.backgroundColor }}>{name}</button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 bg-white border border-zinc-200 rounded-3xl flex flex-col items-center justify-center text-center p-8 shadow-sm">
            <div className="h-16 w-16 rounded-3xl bg-violet-50 flex items-center justify-center mb-4"><Loader2 className="h-8 w-8 text-violet-600 animate-spin" /></div>
            <h3 className="text-xl font-black text-zinc-800">Building your schedules...</h3>
            <p className="text-zinc-500 max-w-md mt-2 text-sm font-medium">Combining logical groups, shared lectures, and section options while pruning timetable collisions as early as possible.</p>
          </div>
        ) : !hasGenerated ? (
          <div className="flex-1 bg-white border-2 border-dashed border-zinc-200 rounded-3xl flex flex-col items-center justify-center text-center p-8 shadow-sm">
            <div className="h-16 w-16 bg-violet-50 rounded-3xl flex items-center justify-center mb-4"><CalendarDays className="h-8 w-8 text-violet-500" /></div>
            <h3 className="text-xl font-black text-zinc-800">Ready to build your week</h3>
            <p className="text-zinc-500 max-w-md mt-2 text-sm font-medium leading-relaxed">Select your subjects. The engine will combine valid group/lecture/section choices and remove overlapping schedules automatically.</p>
          </div>
        ) : displayedSchedules.length === 0 ? (
          <div className="flex-1 bg-white border-2 border-dashed border-red-200 rounded-3xl flex flex-col items-center justify-center text-center p-8 shadow-sm bg-red-50/30">
            <div className="h-16 w-16 bg-red-100 rounded-full flex items-center justify-center mb-3"><CircleAlert className="h-8 w-8 text-red-500" /></div>
            <h3 className="text-lg font-bold text-red-800">No schedules match this filter</h3>
            <p className="text-red-700/80 max-w-md mt-2 text-sm font-semibold">Try changing the Days filter or adjusting your subject selection.</p>
            {message && <div className="max-w-xl mt-4 rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-xs font-semibold text-red-800">{message}</div>}
          </div>
        ) : (
          <TimetableGrid timetable={displayedSchedules[currentIndex]} theme={theme} onRemove={() => {}} />
        )}
      </main>
    </>
  );
}