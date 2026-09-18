"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  CalendarDays,
  MapPin,
  User,
  ChevronRight,
  AlertCircle,
  Clock,
  BookOpen,
  GraduationCap,
  LockKeyhole,
  Sparkles,
  Users,
} from "lucide-react";
import { TimetableEntry } from "../timetable/TimetableBuilder";
import { formatInstructorName } from "@/lib/utils";

const formatTime = (timeStr?: string) =>
  timeStr ? timeStr.slice(0, 5) : "TBA";

const normalizeComponentType = (value?: string) =>
  value === "section" ? "practical" : value;

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
  sourceGroup?: number;
  inheritedFromGroup?: number;
};

type GroupPlan = {
  groupNumber: number;
  groupTotal: number;
  lectureOptions: Choice[];
  sectionOptions: Choice[];
};

type SectionSelectorProps = {
  course: any;
  isOpen: boolean;
  onClose: () => void;
  track: string;
  timetable: TimetableEntry[];
  setTimetable: any;
  completedCourseIds?: string[];
};

export default function SectionSelector({
  course,
  isOpen,
  onClose,
  track,
  timetable,
  setTimetable,
  completedCourseIds,
}: SectionSelectorProps) {
  const [offerings, setOfferings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedGroupNumber, setSelectedGroupNumber] = useState<number | null>(null);

  const [selectedLectureId, setSelectedLectureId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  const [prerequisites, setPrerequisites] = useState<any[]>([]);

  const catalogCourseId =
    course?.catalog_course_id ??
    course?.courses?.catalog_course_id ??
    course?.course_catalog_id ??
    null;

  const currentCourseName =
    course?.courses?.name ?? course?.name ?? "Selected course";

  const currentCourseCode =
    course?.source_code ??
    course?.courses?.code ??
    course?.courses?.schedule_code ??
    "";

  const completedIds = useMemo(
    () => new Set(completedCourseIds ?? []),
    [completedCourseIds]
  );

  // ------------------------------------------------------------
  // Load timetable offerings + prerequisites
  // ------------------------------------------------------------
  useEffect(() => {
    if (!isOpen || !course) return;

    let cancelled = false;

    const loadData = async () => {
      setLoading(true);

      setSelectedGroupNumber(null);
      setSelectedLectureId(null);
      setSelectedSectionId(null);
      setPrerequisites([]);

      const [offeringsResult] = await Promise.all([
        supabase
          .from("offerings")
          .select(`
            id,
            track,
            group_number,
            group_total,
            raw_section_label,
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
          .eq("semester_course_id", course.id)
          .eq("track", track)
          .order("group_number", { ascending: true }),
      ]);

      if (cancelled) return;

      if (!offeringsResult.error) {
        setOfferings(offeringsResult.data ?? []);
      } else {
        setOfferings([]);
      }

      if (catalogCourseId) {
        const { data: prereqRows } = await supabase
          .from("course_prerequisites")
          .select("prerequisite_course_id, is_enforced")
          .eq("course_id", catalogCourseId)
          .eq("is_enforced", true);

        const prereqIds = (prereqRows ?? [])
          .map((row: any) => row.prerequisite_course_id)
          .filter(Boolean);

        if (prereqIds.length > 0) {
          const { data: prereqCourses } = await supabase
            .from("course_catalog")
            .select("id, name, schedule_code, credit_hours")
            .in("id", prereqIds);

          setPrerequisites(prereqCourses ?? []);
        } else {
          setPrerequisites([]);
        }
      }

      setLoading(false);
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [isOpen, course, track, catalogCourseId]);

  // ------------------------------------------------------------
  // Build "logical" groups
  // ------------------------------------------------------------
  const groupPlans = useMemo<GroupPlan[]>(() => {
    if (!offerings.length) return [];

    const groupTotals = offerings
      .map((o) => Number(o.group_total))
      .filter((n) => Number.isFinite(n) && n > 0);

    const inferredTotal = groupTotals.length
      ? Math.max(...groupTotals)
      : Math.max(
          0,
          ...offerings
            .map((o) => Number(o.group_number))
            .filter((n) => Number.isFinite(n))
        );

    if (!inferredTotal) {
      return [
        {
          groupNumber: 0,
          groupTotal: 0,
          lectureOptions: buildLectureOptions(offerings, 0),
          sectionOptions: buildSectionOptions(offerings, 0),
        },
      ];
    }

    const plans: GroupPlan[] = [];

    for (let groupNumber = 1; groupNumber <= inferredTotal; groupNumber++) {
      const matching = offerings.filter(
        (o) => Number(o.group_number) === groupNumber
      );

      const plan: GroupPlan = {
        groupNumber,
        groupTotal: inferredTotal,
        lectureOptions: buildLectureOptions(matching, groupNumber),
        sectionOptions: buildSectionOptions(matching, groupNumber),
      };

      plans.push(plan);
    }

    for (const plan of plans) {
      if (plan.lectureOptions.length > 0) continue;

      const fallback =
        plans.find(
          (candidate) =>
            candidate.groupNumber > plan.groupNumber &&
            candidate.lectureOptions.length > 0
        ) ??
        plans.find(
          (candidate) =>
            candidate.groupNumber !== plan.groupNumber &&
            candidate.lectureOptions.length > 0
        );

      if (fallback) {
        plan.lectureOptions = fallback.lectureOptions.map((option) => ({
          ...option,
          id: `${plan.groupNumber}__fallback__${option.id}`,
          inheritedFromGroup: fallback.groupNumber,
        }));
      }
    }

    return plans;
  }, [offerings]);

  function buildLectureOptions(sourceOfferings: any[], groupNumber: number): Choice[] {
    const options: Choice[] = [];
    for (const offering of sourceOfferings) {
      for (const component of offering.components ?? []) {
        if (normalizeComponentType(component.component_type) !== "lecture") continue;
        for (const option of component.options ?? []) {
          const meetings = option.meetings ?? [];
          if (!meetings.length) continue;
          options.push({
            id: `${groupNumber}__lecture__${offering.id}__${option.id}`,
            label: option.raw_option_label || option.name || `Lecture ${options.length + 1}`,
            meetings,
            sourceGroup: groupNumber,
          });
        }
      }
    }
    return dedupeChoices(options);
  }

  function buildSectionOptions(sourceOfferings: any[], groupNumber: number): Choice[] {
    const options: Choice[] = [];
    for (const offering of sourceOfferings) {
      for (const component of offering.components ?? []) {
        if (normalizeComponentType(component.component_type) !== "practical") continue;
        for (const option of component.options ?? []) {
          const meetings = option.meetings ?? [];
          if (!meetings.length) continue;
          options.push({
            id: `${groupNumber}__section__${offering.id}__${option.id}`,
            label: option.raw_option_label || option.name || component.label || "Section",
            meetings,
            sourceGroup: groupNumber,
          });
        }
      }
    }
    return dedupeChoices(options);
  }

  function dedupeChoices(options: Choice[]) {
    const seen = new Set<string>();
    return options.filter((choice) => {
      const signature = (choice.meetings ?? [])
        .map((m) => `${m.day}|${m.period}|${m.start_time}|${m.end_time}|${m.location}|${m.instructor}`)
        .sort().join("||");
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  }

  const selectedGroup = groupPlans.find((group) => group.groupNumber === selectedGroupNumber);
  const selectedLecture = (selectedGroup?.lectureOptions ?? []).find((option) => option.id === selectedLectureId);
  const selectedSection = (selectedGroup?.sectionOptions ?? []).find((option) => option.id === selectedSectionId);

  const selectedMeetings = useMemo(
    () => [...(selectedLecture?.meetings ?? []), ...(selectedSection?.meetings ?? [])],
    [selectedLecture, selectedSection]
  );

  // ------------------------------------------------------------
  // Prerequisite state (Informational Warning Only)
  // ------------------------------------------------------------
  const missingPrerequisites = useMemo(() => {
    if (!prerequisites.length) return [];
    return prerequisites.filter((prereq) => !completedIds.has(prereq.id));
  }, [prerequisites, completedIds]);

  // ------------------------------------------------------------
  // Timetable conflicts
  // ------------------------------------------------------------
  const getConflict = (meetings: Meeting[]) => {
    if (!course || !course.id) return null;

    for (const meeting of (meetings ?? [])) {
      for (const entry of (timetable ?? [])) {
        if (entry.course_id === course.id) continue;
        for (const existingMeeting of (entry.meetings ?? [])) {
          if (meeting.day === existingMeeting.day && Number(meeting.period) === Number(existingMeeting.period)) {
            return entry.course_name;
          }
        }
      }
    }
    return null;
  };

  const selectedConflict = getConflict(selectedMeetings);

  // ------------------------------------------------------------
  // Add to Timetable Action
  // ------------------------------------------------------------
  const handleAddToTimetable = () => {
    if (!selectedGroup || !course || selectedConflict) return;

    const newEntry: TimetableEntry = {
      course_id: course.id,
      course_name: currentCourseName,
      offering_id: selectedGroupNumber !== null ? `logical-group-${selectedGroupNumber}` : "logical-group",
      meetings: selectedMeetings,
      group_number: selectedGroup.groupNumber,
    } as any;

    setTimetable((prev: any[]) => [
      ...prev.filter((entry) => entry.course_id !== course.id),
      newEntry,
    ]);

    setSelectedGroupNumber(null);
    setSelectedLectureId(null);
    setSelectedSectionId(null);
    onClose();
  };

  const isStep2Ready =
    !!selectedGroup &&
    !!selectedLecture &&
    ((selectedGroup?.sectionOptions?.length ?? 0) === 0 || !!selectedSection) &&
    !selectedConflict;

  const existingCourseSelected = timetable.some((entry) => entry.course_id === course?.id);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[760px] max-h-[90vh] flex flex-col p-0 overflow-hidden bg-white rounded-[28px] shadow-2xl border-0">
        
        {/* HEADER */}
        <DialogHeader className="px-7 py-6 border-b border-zinc-100 bg-gradient-to-br from-violet-50 via-white to-indigo-50 shrink-0">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 shrink-0 rounded-2xl bg-violet-600 text-white flex items-center justify-center shadow-lg shadow-violet-200">
              <BookOpen className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-violet-700 bg-violet-100 px-2.5 py-1 rounded-full">
                  <Sparkles className="h-3 w-3" />
                  Course Setup
                </span>
                <span className="text-xs font-bold text-zinc-400">
                  {track} Track
                </span>
              </div>
              <DialogTitle className="text-2xl font-black text-zinc-900 tracking-tight">
                {currentCourseName}
              </DialogTitle>
              <DialogDescription className="text-zinc-500 font-semibold mt-1">
                {currentCourseCode || "Course"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* NATIVE SCROLLABLE BODY */}
        <div className="flex-1 overflow-y-auto px-6 py-6 bg-zinc-50/40 min-h-0">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-center">
              <div className="h-12 w-12 rounded-2xl bg-violet-100 flex items-center justify-center mb-4">
                <Clock className="h-6 w-6 text-violet-600 animate-pulse" />
              </div>
              <p className="font-bold text-zinc-700">Loading available groups...</p>
            </div>
          ) : selectedGroupNumber === null ? (
            <div className="space-y-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-600">
                    Step 1
                  </div>
                  <h3 className="text-xl font-black text-zinc-900 mt-1">
                    Choose your group
                  </h3>
                </div>
                <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-zinc-500 bg-white border border-zinc-200 rounded-2xl px-3 py-2">
                  <Users className="h-4 w-4 text-violet-500" />
                  {groupPlans.length} groups
                </div>
              </div>

              {/* Informational Prerequisite Warning */}
              {missingPrerequisites.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 flex items-start gap-4">
                  <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                    <LockKeyhole className="h-4 w-4 text-amber-700" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-black text-zinc-900">Prerequisite notice</h3>
                    <p className="text-sm text-zinc-600 mt-1 leading-relaxed">
                      You may need to pass the following courses before registering for this subject. (You can still add this to your timetable to plan your schedule).
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {missingPrerequisites.map((prereq) => (
                        <span key={prereq.id} className="inline-flex items-center bg-white border border-amber-200 px-3 py-1.5 rounded-lg text-xs font-bold text-zinc-700">
                          {prereq.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {groupPlans.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-10 text-center">
                  <AlertCircle className="h-7 w-7 text-zinc-400 mx-auto mb-3" />
                  <p className="font-bold text-zinc-700">No timetable groups found</p>
                  <p className="text-sm text-zinc-400 mt-1">
                    The course is not currently connected to group data for the {track} track.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {groupPlans.map((group) => {
                    const groupLectureConflict = group.lectureOptions.some((lecture) => !!getConflict(lecture.meetings));
                    const availableLectures = group.lectureOptions.filter((lecture) => !getConflict(lecture.meetings));
                    const availableSections = group.sectionOptions.filter((section) => !getConflict(section.meetings));

                    const blocked =
                      availableLectures.length === 0 ||
                      (group.sectionOptions.length > 0 && availableSections.length === 0);

                    return (
                      <button
                        type="button"
                        key={group.groupNumber}
                        disabled={blocked}
                        onClick={() => {
                          if (blocked) return;
                          setSelectedGroupNumber(group.groupNumber);
                          setSelectedLectureId(availableLectures[0]?.id ?? null);
                          setSelectedSectionId(availableSections.length === 1 ? availableSections[0].id : null);
                        }}
                        className={`w-full text-left p-5 rounded-3xl border transition-all ${
                          blocked
                            ? "border-zinc-200 bg-zinc-50 opacity-60 cursor-not-allowed"
                            : "border-zinc-200 bg-white hover:border-violet-400 hover:shadow-lg hover:-translate-y-0.5 group"
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 ${blocked ? "bg-zinc-200 text-zinc-500" : "bg-violet-100 text-violet-700"}`}>
                            <GraduationCap className="h-6 w-6" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <div className="text-xs font-black uppercase tracking-widest text-zinc-400">Group {group.groupNumber}</div>
                                <div className="text-lg font-black text-zinc-900 mt-0.5">Group {group.groupNumber}</div>
                              </div>
                              {!blocked && <ChevronRight className="h-5 w-5 text-zinc-300 group-hover:text-violet-500 transition-colors" />}
                            </div>

                            <div className="flex flex-wrap gap-2 mt-3">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold text-zinc-600">
                                <BookOpen className="h-3.5 w-3.5" />
                                {group.lectureOptions.length} lecture option{group.lectureOptions.length === 1 ? "" : "s"}
                              </span>
                              {group.sectionOptions.length > 0 && (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                                  <Users className="h-3.5 w-3.5" />
                                  {group.sectionOptions.length} section{group.sectionOptions.length === 1 ? "" : "s"}
                                </span>
                              )}
                            </div>

                            {groupLectureConflict && blocked && (
                              <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2">
                                <AlertCircle className="h-3.5 w-3.5" /> No conflict-free timetable option is available.
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {existingCourseSelected && (
                <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800 font-semibold">
                  This course is already on your timetable. Choosing a new group will replace its current selection.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-600">Step 2</div>
                  <h3 className="text-xl font-black text-zinc-900 mt-1">Build Group {selectedGroup?.groupNumber ?? ""}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedGroupNumber(null);
                    setSelectedLectureId(null);
                    setSelectedSectionId(null);
                  }}
                  className="text-xs font-black text-violet-600 hover:text-violet-800"
                >
                  ← Back
                </button>
              </div>

              {/* LECTURE SELECTION */}
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="font-black text-zinc-900">Lecture</h4>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest bg-violet-100 text-violet-700 px-2.5 py-1 rounded-full">Choose one</span>
                </div>

                <div className="grid gap-3">
                  {(selectedGroup?.lectureOptions ?? []).map((option) => {
                    const conflictCourse = getConflict(option.meetings);
                    const disabled = !!conflictCourse;
                    const selected = option.id === selectedLectureId;

                    return (
                      <button
                        type="button"
                        key={option.id}
                        disabled={disabled}
                        onClick={() => !disabled && setSelectedLectureId(option.id)}
                        className={`w-full text-left p-4 rounded-2xl border transition-all ${
                          disabled
                            ? "border-zinc-200 bg-zinc-50 opacity-60 cursor-not-allowed"
                            : selected
                            ? "border-violet-500 bg-violet-50/70 ring-2 ring-violet-100"
                            : "border-zinc-200 bg-white hover:border-violet-300 hover:shadow-sm"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`h-5 w-5 mt-0.5 rounded-full border-2 shrink-0 flex items-center justify-center ${selected ? "border-violet-600" : "border-zinc-300"}`}>
                            {selected && <div className="h-2.5 w-2.5 rounded-full bg-violet-600" />}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <div className="font-black text-zinc-900">{option.label}</div>
                              {disabled && <span className="text-[10px] font-black text-red-600 bg-red-50 px-2 py-1 rounded-lg">Clash</span>}
                            </div>
                            <MeetingList meetings={option.meetings} />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* SECTION / PRACTICAL SELECTION */}
              {(selectedGroup?.sectionOptions?.length ?? 0) > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="font-black text-zinc-900">Section / Practical</h4>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">Choose one</span>
                  </div>

                  <div className="grid gap-3">
                    {(selectedGroup?.sectionOptions ?? []).map((option) => {
                      const conflictCourse = getConflict(option.meetings);
                      const disabled = !!conflictCourse;
                      const selected = option.id === selectedSectionId;

                      return (
                        <button
                          type="button"
                          key={option.id}
                          disabled={disabled}
                          onClick={() => !disabled && setSelectedSectionId(option.id)}
                          className={`w-full text-left p-4 rounded-2xl border transition-all ${
                            disabled
                              ? "border-zinc-200 bg-zinc-50 opacity-60 cursor-not-allowed"
                              : selected
                              ? "border-amber-500 bg-amber-50/80 ring-2 ring-amber-100"
                              : "border-zinc-200 bg-white hover:border-amber-300 hover:shadow-sm"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`h-5 w-5 mt-0.5 rounded-full border-2 shrink-0 flex items-center justify-center ${selected ? "border-amber-600" : "border-zinc-300"}`}>
                              {selected && <div className="h-2.5 w-2.5 rounded-full bg-amber-600" />}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between gap-3">
                                <div className="font-black text-zinc-900">{option.label}</div>
                                {disabled && <span className="text-[10px] font-black text-red-600 bg-red-50 px-2 py-1 rounded-lg">Clash</span>}
                              </div>
                              <MeetingList meetings={option.meetings} />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {selectedConflict && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <div className="font-black text-red-800">Timetable conflict</div>
                    <div className="text-red-700/80 mt-0.5">
                      One of your selected meetings clashes with <strong>{selectedConflict}</strong>.
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="p-5 border-t border-zinc-100 bg-white flex items-center justify-between gap-3 shrink-0 rounded-b-[28px]">
          <div className="hidden sm:block text-xs font-semibold text-zinc-400">
            {selectedGroupNumber === null
              ? "Select a group to continue"
              : isStep2Ready
              ? "Ready to add to your timetable"
              : "Complete the required lecture / section choices"}
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <Button variant="outline" className="font-bold rounded-xl" onClick={onClose}>
              Cancel
            </Button>

            {selectedGroupNumber !== null && (
              <Button
                disabled={!isStep2Ready}
                className="bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 disabled:bg-zinc-200 shadow-sm px-5"
                onClick={handleAddToTimetable}
              >
                Add to Timetable
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MeetingList({ meetings }: { meetings: Meeting[] }) {
  return (
    <div className="mt-3 space-y-2">
      {(meetings ?? []).map((meeting, idx) => (
        <div key={idx} className="rounded-xl bg-zinc-50 border border-zinc-100 p-3">
          <div className="flex items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4 text-violet-500 shrink-0" />
            <span className="font-black text-zinc-800">{meeting.day}</span>
            <span className="text-zinc-500 font-semibold text-xs">
              P{meeting.period} ({formatTime(meeting.start_time)} - {formatTime(meeting.end_time)})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-2 ml-6">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600">
              <MapPin className="h-3.5 w-3.5 text-zinc-400" />
              {meeting.location || "TBA"}
            </div>

            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600">
              <User className="h-3.5 w-3.5 text-zinc-400" />
              {formatInstructorName(meeting.instructor)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}