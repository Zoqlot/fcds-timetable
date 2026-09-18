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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CalendarDays,
  MapPin,
  User,
  ChevronRight,
  AlertCircle,
  Clock,
  CheckCircle2,
  BookOpen,
  GraduationCap,
  LockKeyhole,
  Sparkles,
  Users,
} from "lucide-react";
import { TimetableEntry } from "../timetable/TimetableBuilder";
import { formatInstructorName } from "@/lib/utils";

const FALLBACK_MAX_SUBJECTS = 7;
const FALLBACK_MAX_CREDITS = 19;
const FALLBACK_EXTENDED_MAX_CREDITS = 21;
const FALLBACK_EXTENDED_GPA_THRESHOLD = 3.333;
const MAX_CREDITS_PER_COURSE = 3;

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

type RegistrationRules = {
  regularMaxCredits: number;
  extendedMaxCredits: number;
};

type SectionSelectorProps = {
  course: any;
  isOpen: boolean;
  onClose: () => void;
  track: string;
  timetable: TimetableEntry[];
  setTimetable: any;

  /**
   * Pass the catalog IDs of courses the student has already PASSED.
   * This is intentionally separate from `timetable`, because merely
   * selecting a prerequisite this semester does not mean it was passed.
   */
  completedCourseIds?: string[];

  /** Optional current GPA. Used for the 19 -> 21 credit extension gate. */
  gpa?: number | null;
};

export default function SectionSelector({
  course,
  isOpen,
  onClose,
  track,
  timetable,
  setTimetable,
  completedCourseIds,
  gpa,
}: SectionSelectorProps) {
  const [offerings, setOfferings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedGroupNumber, setSelectedGroupNumber] = useState<number | null>(
    null
  );

  const [selectedLectureId, setSelectedLectureId] = useState<string | null>(
    null
  );
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    null
  );

  const [prerequisites, setPrerequisites] = useState<any[]>([]);
  const [loadingPrerequisites, setLoadingPrerequisites] = useState(false);

  const [courseCredits, setCourseCredits] = useState<number>(0);
  const [registrationRules, setRegistrationRules] = useState<RegistrationRules>(
    {
      regularMaxCredits: FALLBACK_MAX_CREDITS,
      extendedMaxCredits: FALLBACK_EXTENDED_MAX_CREDITS,
    }
  );

  const [showGpaDialog, setShowGpaDialog] = useState(false);
  const [gpaInput, setGpaInput] = useState("");
  const [gpaGateError, setGpaGateError] = useState("");

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
  // Load timetable offerings + course credit + prerequisites
  // ------------------------------------------------------------
  useEffect(() => {
    if (!isOpen || !course) return;

    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      setLoadingPrerequisites(true);

      setSelectedGroupNumber(null);
      setSelectedLectureId(null);
      setSelectedSectionId(null);
      setPrerequisites([]);
      setCourseCredits(0);
      setGpaGateError("");

      const [
        offeringsResult,
        courseCreditResult,
        rulesResult,
      ] = await Promise.all([
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

        catalogCourseId
          ? supabase
              .from("course_catalog")
              .select("id, name, schedule_code, credit_hours")
              .eq("id", catalogCourseId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),

        supabase
          .from("academic_rules")
          .select("rule_key, value_numeric")
          .in("rule_key", [
            "fall_spring_max_credit_hours",
            "fall_spring_extended_max_credit_hours",
          ]),
      ]);

      if (cancelled) return;

      if (!offeringsResult.error) {
        setOfferings(offeringsResult.data ?? []);
      } else {
        setOfferings([]);
      }

      setCourseCredits(
        Number(courseCreditResult.data?.credit_hours ?? course?.credit_hours ?? 0)
      );

      const rulesMap = new Map(
        (rulesResult.data ?? []).map((r: any) => [
          r.rule_key,
          Number(r.value_numeric),
        ])
      );

      setRegistrationRules({
        regularMaxCredits:
          rulesMap.get("fall_spring_max_credit_hours") ??
          FALLBACK_MAX_CREDITS,
        extendedMaxCredits:
          rulesMap.get("fall_spring_extended_max_credit_hours") ??
          FALLBACK_EXTENDED_MAX_CREDITS,
      });

      // Pull only enforced prerequisite relations, then resolve names from
      // course_catalog in a second query. This matches the schema we created.
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
      setLoadingPrerequisites(false);
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [isOpen, course, track, catalogCourseId]);

  // ------------------------------------------------------------
  // Build "logical" groups from the new DB shape.
  //
  // Important: a group does NOT have to contain both its lecture and
  // section in the same offering. We collect them independently.
  // This handles cases such as:
  //   - Group 1 lecture + Group 1 sections
  //   - Group 1+2 shared lecture
  //   - Group 3 lecture but no explicit section
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

    // If a group has no explicit lecture, borrow the closest available
    // lecture pool instead of making the student think the course has
    // no lecture. The UI clearly labels it as inherited.
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

  function buildLectureOptions(
    sourceOfferings: any[],
    groupNumber: number
  ): Choice[] {
    const options: Choice[] = [];

    for (const offering of sourceOfferings) {
      for (const component of offering.components ?? []) {
        if (normalizeComponentType(component.component_type) !== "lecture") {
          continue;
        }

        for (const option of component.options ?? []) {
          const meetings = option.meetings ?? [];
          if (!meetings.length) continue;

          const optionId = `${groupNumber}__lecture__${offering.id}__${option.id}`;

          options.push({
            id: optionId,
            label:
              option.raw_option_label ||
              option.name ||
              `Lecture ${options.length + 1}`,
            meetings,
            sourceGroup: groupNumber,
          });
        }
      }
    }

    return dedupeChoices(options);
  }

  function buildSectionOptions(
    sourceOfferings: any[],
    groupNumber: number
  ): Choice[] {
    const options: Choice[] = [];

    for (const offering of sourceOfferings) {
      for (const component of offering.components ?? []) {
        const type = normalizeComponentType(component.component_type);

        if (type !== "practical") continue;

        for (const option of component.options ?? []) {
          const meetings = option.meetings ?? [];
          if (!meetings.length) continue;

          const label =
            option.raw_option_label ||
            option.name ||
            component.label ||
            "Section";

          options.push({
            id: `${groupNumber}__section__${offering.id}__${option.id}`,
            label,
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
      const signature = choice.meetings
        .map(
          (m) =>
            `${m.day}|${m.period}|${m.start_time}|${m.end_time}|${m.location}|${m.instructor}`
        )
        .sort()
        .join("||");

      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  }

  const selectedGroup = groupPlans.find(
    (group) => group.groupNumber === selectedGroupNumber
  );

  const selectedLecture = selectedGroup?.lectureOptions.find(
    (option) => option.id === selectedLectureId
  );

  const selectedSection = selectedGroup?.sectionOptions.find(
    (option) => option.id === selectedSectionId
  );

  const selectedMeetings = useMemo(
    () => [
      ...(selectedLecture?.meetings ?? []),
      ...(selectedSection?.meetings ?? []),
    ],
    [selectedLecture, selectedSection]
  );

  // ------------------------------------------------------------
  // Prerequisite state
  // ------------------------------------------------------------
  const missingPrerequisites = useMemo(() => {
    if (!prerequisites.length) return [];
    return prerequisites.filter((prereq) => !completedIds.has(prereq.id));
  }, [prerequisites, completedIds]);

  const prerequisiteStatusAvailable =
    completedCourseIds !== undefined;

  const prerequisiteReady =
    prerequisites.length === 0 ||
    (prerequisiteStatusAvailable && missingPrerequisites.length === 0);

  // ------------------------------------------------------------
  // Timetable conflicts
  // ------------------------------------------------------------
  const getConflict = (meetings: Meeting[]) => {
    if (!course) return null;

    for (const meeting of meetings) {
      for (const entry of timetable) {
        if (entry.course_id === course.id) continue;

        for (const existingMeeting of entry.meetings ?? []) {
          if (
            meeting.day === existingMeeting.day &&
            Number(meeting.period) === Number(existingMeeting.period)
          ) {
            return entry.course_name;
          }
        }
      }
    }

    return null;
  };

  const selectedConflict = getConflict(selectedMeetings);

  // ------------------------------------------------------------
  // Registration limits
  // ------------------------------------------------------------
  const getCurrentRegistrationStats = async () => {
    const existingEntries = timetable.filter(
      (entry) => entry.course_id !== course?.id
    );

    const courseCount = existingEntries.length;

    // New entries created by this component carry credit_hours.
    // For older entries, resolve them through semester_courses -> courses.
    let currentCredits = existingEntries.reduce(
      (sum, entry: any) => sum + Number(entry.credit_hours ?? 0),
      0
    );

    const unresolvedEntries = existingEntries.filter(
      (entry: any) => entry.credit_hours === undefined
    );

    if (unresolvedEntries.length > 0) {
      const ids = unresolvedEntries.map((entry) => entry.course_id);

      const { data: semesterCourses } = await supabase
        .from("semester_courses")
        .select(`
          id,
          courses (
            catalog_course_id
          )
        `)
        .in("id", ids);

      const catalogIds = (semesterCourses ?? [])
        .map((row: any) => row.courses?.catalog_course_id)
        .filter(Boolean);

      if (catalogIds.length > 0) {
        const { data: catalogRows } = await supabase
          .from("course_catalog")
          .select("id, credit_hours")
          .in("id", catalogIds);

        const byCatalogId = new Map(
          (catalogRows ?? []).map((row: any) => [
            row.id,
            Number(row.credit_hours ?? 0),
          ])
        );

        for (const row of semesterCourses ?? []) {
          const catalogId = row.courses?.catalog_course_id;
          if (catalogId) {
            currentCredits += byCatalogId.get(catalogId) ?? 0;
          }
        }
      }
    }

    return { courseCount, currentCredits };
  };

  const finalizeAdd = () => {
    if (!selectedGroup || !course) return;

    const newEntry: TimetableEntry & {
      credit_hours?: number;
      catalog_course_id?: string | null;
      group_number?: number;
    } = {
      course_id: course.id,
      course_name: currentCourseName,
      offering_id:
        selectedGroupNumber !== null
          ? `logical-group-${selectedGroupNumber}`
          : "logical-group",
      meetings: selectedMeetings,
      credit_hours: courseCredits,
      catalog_course_id: catalogCourseId,
      group_number: selectedGroup.groupNumber,
    };

    setTimetable((prev: any[]) => [
      ...prev.filter((entry) => entry.course_id !== course.id),
      newEntry,
    ]);

    setSelectedGroupNumber(null);
    setSelectedLectureId(null);
    setSelectedSectionId(null);
    setShowGpaDialog(false);
    setGpaGateError("");
    onClose();
  };

  const validateAndAdd = async () => {
    if (!course || !selectedGroup) return;

    if (!prerequisiteReady) return;

    if (selectedConflict) return;

    if (courseCredits > MAX_CREDITS_PER_COURSE) {
      setGpaGateError(
        `${currentCourseName} has ${courseCredits} credit hours. This timetable currently allows courses up to 3 credit hours.`
      );
      return;
    }

    const { courseCount, currentCredits } =
      await getCurrentRegistrationStats();

    if (courseCount >= FALLBACK_MAX_SUBJECTS) {
      setGpaGateError(
        `You already have ${courseCount} subjects. The timetable allows a maximum of ${FALLBACK_MAX_SUBJECTS} subjects.`
      );
      return;
    }

    const nextCredits = currentCredits + courseCredits;

    if (nextCredits > registrationRules.extendedMaxCredits) {
      setGpaGateError(
        `This would take your semester to ${nextCredits} credit hours. The extended maximum is ${registrationRules.extendedMaxCredits}.`
      );
      return;
    }

    if (nextCredits > registrationRules.regularMaxCredits) {
      const knownGpa =
        typeof gpa === "number"
          ? gpa
          : Number.isFinite(Number(gpaInput))
          ? Number(gpaInput)
          : null;

      if (knownGpa === null) {
        setGpaGateError("");
        setShowGpaDialog(true);
        return;
      }

      if (knownGpa <= FALLBACK_EXTENDED_GPA_THRESHOLD) {
        setGpaGateError(
          `A load above ${registrationRules.regularMaxCredits} credits requires a GPA above ${FALLBACK_EXTENDED_GPA_THRESHOLD.toFixed(
            3
          )}.`
        );
        return;
      }
    }

    finalizeAdd();
  };

  const handleGpaContinue = async () => {
    const parsed = Number(gpaInput);

    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 4) {
      setGpaGateError("Enter a valid GPA between 0.000 and 4.000.");
      return;
    }

    if (parsed <= FALLBACK_EXTENDED_GPA_THRESHOLD) {
      setGpaGateError(
        `Your GPA must be above ${FALLBACK_EXTENDED_GPA_THRESHOLD.toFixed(
          3
        )} to exceed ${registrationRules.regularMaxCredits} credit hours.`
      );
      return;
    }

    setGpaGateError("");
    setShowGpaDialog(false);

    // Re-run the exact validation with the entered GPA.
    const { courseCount, currentCredits } =
      await getCurrentRegistrationStats();
    const nextCredits = currentCredits + courseCredits;

    if (courseCount >= FALLBACK_MAX_SUBJECTS) {
      setGpaGateError(
        `You already have ${courseCount} subjects. The timetable allows a maximum of ${FALLBACK_MAX_SUBJECTS} subjects.`
      );
      return;
    }

    if (nextCredits > registrationRules.extendedMaxCredits) {
      setGpaGateError(
        `This would take your semester to ${nextCredits} credit hours.`
      );
      return;
    }

    finalizeAdd();
  };

  const isStep2Ready =
    !!selectedGroup &&
    !!selectedLecture &&
    (selectedGroup.sectionOptions.length === 0 || !!selectedSection) &&
    !selectedConflict;

  const existingCourseSelected = timetable.some(
    (entry) => entry.course_id === course?.id
  );

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => !open && onClose()}
      >
        <DialogContent className="sm:max-w-[760px] max-h-[90vh] flex flex-col p-0 overflow-hidden bg-white rounded-[28px] shadow-2xl border-0">
          <DialogHeader className="px-7 py-6 border-b border-zinc-100 bg-gradient-to-br from-violet-50 via-white to-indigo-50">
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
                  {currentCourseCode || "Course"} • {courseCredits} credit hour
                  {courseCredits === 1 ? "" : "s"}
                </DialogDescription>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5 mt-5">
              <div className="rounded-2xl bg-white/90 border border-white px-3 py-3 shadow-sm">
                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                  Subjects
                </div>
                <div className="mt-1 text-sm font-black text-zinc-900">
                  {Math.min(timetable.length, FALLBACK_MAX_SUBJECTS)} /{" "}
                  {FALLBACK_MAX_SUBJECTS}
                </div>
              </div>

              <div className="rounded-2xl bg-white/90 border border-white px-3 py-3 shadow-sm">
                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                  Standard load
                </div>
                <div className="mt-1 text-sm font-black text-zinc-900">
                  {registrationRules.regularMaxCredits} credits
                </div>
              </div>

              <div className="rounded-2xl bg-white/90 border border-white px-3 py-3 shadow-sm">
                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                  Extended load
                </div>
                <div className="mt-1 text-sm font-black text-zinc-900">
                  {registrationRules.extendedMaxCredits} credits
                </div>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 px-6 py-6 bg-zinc-50/40">
            {loading ? (
              <div className="py-16 flex flex-col items-center justify-center text-center">
                <div className="h-12 w-12 rounded-2xl bg-violet-100 flex items-center justify-center mb-4">
                  <Clock className="h-6 w-6 text-violet-600 animate-pulse" />
                </div>
                <p className="font-bold text-zinc-700">
                  Loading available groups...
                </p>
                <p className="text-sm text-zinc-400 mt-1">
                  Building the timetable from the imported schedule.
                </p>
              </div>
            ) : !prerequisiteReady && prerequisites.length > 0 ? (
              <div className="space-y-5">
                <div className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6">
                  <div className="flex items-start gap-4">
                    <div className="h-11 w-11 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
                      <LockKeyhole className="h-5 w-5 text-amber-700" />
                    </div>

                    <div className="flex-1">
                      <h3 className="font-black text-zinc-900">
                        Prerequisite check
                      </h3>

                      {!prerequisiteStatusAvailable ? (
                        <p className="text-sm text-zinc-600 mt-1.5 leading-6">
                          This course has enforced prerequisites, but the
                          student&apos;s passed-course list has not been loaded
                          into the selector yet.
                        </p>
                      ) : missingPrerequisites.length > 0 ? (
                        <>
                          <p className="text-sm text-zinc-600 mt-1.5 leading-6">
                            You need to have passed the following course
                            {missingPrerequisites.length > 1 ? "s" : ""} before
                            registering:
                          </p>

                          <div className="mt-4 space-y-2">
                            {missingPrerequisites.map((prereq) => (
                              <div
                                key={prereq.id}
                                className="flex items-center justify-between rounded-2xl bg-white border border-amber-100 px-4 py-3"
                              >
                                <div>
                                  <div className="font-bold text-zinc-900">
                                    {prereq.name}
                                  </div>
                                  <div className="text-xs font-semibold text-zinc-400 mt-0.5">
                                    {prereq.schedule_code || "Catalog course"}
                                  </div>
                                </div>

                                <AlertCircle className="h-4 w-4 text-amber-600" />
                              </div>
                            ))}
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>

                {!prerequisiteStatusAvailable && (
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500">
                    Pass <code className="font-mono">completedCourseIds</code>{" "}
                    from the student transcript/profile to enable registration.
                  </div>
                )}
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
                    <p className="text-sm text-zinc-500 mt-1">
                      We combine lecture and section data independently, so
                      messy group formats from the source timetable do not
                      break the student experience.
                    </p>
                  </div>

                  <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-zinc-500 bg-white border border-zinc-200 rounded-2xl px-3 py-2">
                    <Users className="h-4 w-4 text-violet-500" />
                    {groupPlans.length} groups
                  </div>
                </div>

                {groupPlans.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-10 text-center">
                    <AlertCircle className="h-7 w-7 text-zinc-400 mx-auto mb-3" />
                    <p className="font-bold text-zinc-700">
                      No timetable groups found
                    </p>
                    <p className="text-sm text-zinc-400 mt-1">
                      The course is not currently connected to group data for
                      the {track} track.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {groupPlans.map((group) => {
                      const groupLectureConflict = group.lectureOptions.some(
                        (lecture) => !!getConflict(lecture.meetings)
                      );

                      const availableLectures = group.lectureOptions.filter(
                        (lecture) => !getConflict(lecture.meetings)
                      );

                      const availableSections = group.sectionOptions.filter(
                        (section) => !getConflict(section.meetings)
                      );

                      const blocked =
                        availableLectures.length === 0 ||
                        (group.sectionOptions.length > 0 &&
                          availableSections.length === 0);

                      return (
                        <button
                          type="button"
                          key={group.groupNumber}
                          disabled={blocked}
                          onClick={() => {
                            if (blocked) return;

                            const firstLecture =
                              availableLectures[0] ?? null;

                            setSelectedGroupNumber(group.groupNumber);
                            setSelectedLectureId(firstLecture?.id ?? null);

                            const firstSection =
                              availableSections.length === 1
                                ? availableSections[0]
                                : null;

                            setSelectedSectionId(firstSection?.id ?? null);
                          }}
                          className={`w-full text-left p-5 rounded-3xl border transition-all ${
                            blocked
                              ? "border-zinc-200 bg-zinc-50 opacity-60 cursor-not-allowed"
                              : "border-zinc-200 bg-white hover:border-violet-400 hover:shadow-lg hover:-translate-y-0.5 group"
                          }`}
                        >
                          <div className="flex items-start gap-4">
                            <div
                              className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 ${
                                blocked
                                  ? "bg-zinc-200 text-zinc-500"
                                  : "bg-violet-100 text-violet-700"
                              }`}
                            >
                              <GraduationCap className="h-6 w-6" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-4">
                                <div>
                                  <div className="text-xs font-black uppercase tracking-widest text-zinc-400">
                                    Group {group.groupNumber}
                                  </div>
                                  <div className="text-lg font-black text-zinc-900 mt-0.5">
                                    Group {group.groupNumber}
                                  </div>
                                </div>

                                {!blocked && (
                                  <ChevronRight className="h-5 w-5 text-zinc-300 group-hover:text-violet-500 transition-colors" />
                                )}
                              </div>

                              <div className="flex flex-wrap gap-2 mt-3">
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold text-zinc-600">
                                  <BookOpen className="h-3.5 w-3.5" />
                                  {group.lectureOptions.length} lecture option
                                  {group.lectureOptions.length === 1
                                    ? ""
                                    : "s"}
                                </span>

                                {group.sectionOptions.length > 0 && (
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                                    <Users className="h-3.5 w-3.5" />
                                    {group.sectionOptions.length} section
                                    {group.sectionOptions.length === 1
                                      ? ""
                                      : "s"}
                                  </span>
                                )}

                                {group.lectureOptions.some(
                                  (x) => x.inheritedFromGroup
                                ) && (
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700">
                                    Shared lecture mapping
                                  </span>
                                )}
                              </div>

                              {groupLectureConflict && blocked && (
                                <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2">
                                  <AlertCircle className="h-3.5 w-3.5" />
                                  No conflict-free timetable option is
                                  available for this group.
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {prerequisites.length > 0 && prerequisiteReady && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                    <div className="text-sm">
                      <div className="font-black text-emerald-800">
                        Prerequisites satisfied
                      </div>
                      <div className="text-emerald-700/80">
                        All enforced prerequisites in the database are marked
                        as passed.
                      </div>
                    </div>
                  </div>
                )}

                {existingCourseSelected && (
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800 font-semibold">
                    This course is already on your timetable. Choosing a new
                    group will replace its current group/section selection.
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-600">
                      Step 2
                    </div>
                    <h3 className="text-xl font-black text-zinc-900 mt-1">
                      Build Group {selectedGroup?.groupNumber}
                    </h3>
                    <p className="text-sm text-zinc-500 mt-1">
                      Pick the lecture and your section independently.
                    </p>
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

                {/* Lecture */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="font-black text-zinc-900">
                        Lecture
                      </h4>
                      <p className="text-xs font-semibold text-zinc-400 mt-0.5">
                        Choose the lecture session for your group.
                      </p>
                    </div>

                    <span className="text-[10px] font-black uppercase tracking-widest bg-violet-100 text-violet-700 px-2.5 py-1 rounded-full">
                      Choose one
                    </span>
                  </div>

                  <div className="grid gap-3">
                    {selectedGroup?.lectureOptions.map((option) => {
                      const conflictCourse = getConflict(option.meetings);
                      const disabled = !!conflictCourse;
                      const selected = option.id === selectedLectureId;

                      return (
                        <button
                          type="button"
                          key={option.id}
                          disabled={disabled}
                          onClick={() =>
                            !disabled && setSelectedLectureId(option.id)
                          }
                          className={`w-full text-left p-4 rounded-2xl border transition-all ${
                            disabled
                              ? "border-zinc-200 bg-zinc-50 opacity-60 cursor-not-allowed"
                              : selected
                              ? "border-violet-500 bg-violet-50/70 ring-2 ring-violet-100"
                              : "border-zinc-200 bg-white hover:border-violet-300 hover:shadow-sm"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`h-5 w-5 mt-0.5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                                selected
                                  ? "border-violet-600"
                                  : "border-zinc-300"
                              }`}
                            >
                              {selected && (
                                <div className="h-2.5 w-2.5 rounded-full bg-violet-600" />
                              )}
                            </div>

                            <div className="flex-1">
                              <div className="flex items-center justify-between gap-3">
                                <div className="font-black text-zinc-900">
                                  {option.label}
                                </div>

                                {disabled && (
                                  <span className="text-[10px] font-black text-red-600 bg-red-50 px-2 py-1 rounded-lg">
                                    Clash
                                  </span>
                                )}
                              </div>

                              {option.inheritedFromGroup && (
                                <div className="mt-1.5 text-[11px] font-bold text-indigo-600">
                                  Using the shared lecture mapped from Group{" "}
                                  {option.inheritedFromGroup}
                                </div>
                              )}

                              <MeetingList meetings={option.meetings} />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Section */}
                {selectedGroup?.sectionOptions.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h4 className="font-black text-zinc-900">
                          Section / Practical
                        </h4>
                        <p className="text-xs font-semibold text-zinc-400 mt-0.5">
                          Pick the section that fits your timetable.
                        </p>
                      </div>

                      <span className="text-[10px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">
                        Choose one
                      </span>
                    </div>

                    <div className="grid gap-3">
                      {selectedGroup.sectionOptions.map((option) => {
                        const conflictCourse = getConflict(option.meetings);
                        const disabled = !!conflictCourse;
                        const selected = option.id === selectedSectionId;

                        return (
                          <button
                            type="button"
                            key={option.id}
                            disabled={disabled}
                            onClick={() =>
                              !disabled && setSelectedSectionId(option.id)
                            }
                            className={`w-full text-left p-4 rounded-2xl border transition-all ${
                              disabled
                                ? "border-zinc-200 bg-zinc-50 opacity-60 cursor-not-allowed"
                                : selected
                                ? "border-amber-500 bg-amber-50/80 ring-2 ring-amber-100"
                                : "border-zinc-200 bg-white hover:border-amber-300 hover:shadow-sm"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`h-5 w-5 mt-0.5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                                  selected
                                    ? "border-amber-600"
                                    : "border-zinc-300"
                                }`}
                              >
                                {selected && (
                                  <div className="h-2.5 w-2.5 rounded-full bg-amber-600" />
                                )}
                              </div>

                              <div className="flex-1">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="font-black text-zinc-900">
                                    {option.label}
                                  </div>

                                  {disabled && (
                                    <span className="text-[10px] font-black text-red-600 bg-red-50 px-2 py-1 rounded-lg">
                                      Clash
                                    </span>
                                  )}
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
                      <div className="font-black text-red-800">
                        Timetable conflict
                      </div>
                      <div className="text-red-700/80 mt-0.5">
                        One of your selected meetings clashes with{" "}
                        <strong>{selectedConflict}</strong>.
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-3xl bg-zinc-900 text-white p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    <span className="font-black">Selection summary</span>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3">
                    <SummaryPill
                      label="Group"
                      value={`Group ${selectedGroup?.groupNumber}`}
                    />
                    <SummaryPill
                      label="Meetings"
                      value={`${selectedMeetings.length}`}
                    />
                    <SummaryPill
                      label="Credits"
                      value={`${courseCredits}`}
                    />
                  </div>

                  <p className="text-xs text-zinc-400 mt-4 leading-5">
                    Current semester rules allow up to{" "}
                    {registrationRules.regularMaxCredits} credits normally,
                    with an extended ceiling of{" "}
                    {registrationRules.extendedMaxCredits}. Going above the
                    normal ceiling will trigger the GPA check.
                  </p>
                </div>
              </div>
            )}
          </ScrollArea>

          <div className="p-5 border-t border-zinc-100 bg-white flex items-center justify-between gap-3">
            <div className="hidden sm:block text-xs font-semibold text-zinc-400">
              {selectedGroupNumber === null
                ? "Select a group to continue"
                : isStep2Ready
                ? "Ready to add to your timetable"
                : "Complete the required lecture / section choices"}
            </div>

            <div className="flex items-center gap-3 ml-auto">
              <Button
                variant="outline"
                className="font-bold rounded-xl"
                onClick={onClose}
              >
                Cancel
              </Button>

              {selectedGroupNumber !== null && (
                <Button
                  disabled={!isStep2Ready}
                  className="bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 disabled:bg-zinc-200 shadow-sm px-5"
                  onClick={validateAndAdd}
                >
                  Add to Timetable
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* GPA gate for the 19 -> 21 credit extension */}
      <Dialog
        open={showGpaDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowGpaDialog(false);
            setGpaGateError("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[470px] rounded-[28px] border-0 shadow-2xl">
          <DialogHeader>
            <div className="h-11 w-11 rounded-2xl bg-violet-100 flex items-center justify-center mb-2">
              <GraduationCap className="h-5 w-5 text-violet-700" />
            </div>

            <DialogTitle className="text-xl font-black">
              Extended credit load
            </DialogTitle>

            <DialogDescription className="text-zinc-500 leading-6">
              Your selection would take the semester above{" "}
              {registrationRules.regularMaxCredits} credit hours. Enter your
              current GPA to check whether you can continue up to{" "}
              {registrationRules.extendedMaxCredits}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400">
                Current GPA
              </label>

              <Input
                value={gpaInput}
                onChange={(event) => {
                  setGpaInput(event.target.value);
                  setGpaGateError("");
                }}
                inputMode="decimal"
                placeholder="e.g. 3.50"
                className="mt-2 h-12 rounded-xl text-lg font-bold"
              />
            </div>

            <div className="rounded-2xl bg-zinc-50 border border-zinc-200 px-4 py-3 text-sm text-zinc-600">
              Required: GPA above{" "}
              <strong>{FALLBACK_EXTENDED_GPA_THRESHOLD.toFixed(3)}</strong>.
            </div>

            {gpaGateError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-semibold">
                {gpaGateError}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <Button
                variant="outline"
                className="rounded-xl font-bold"
                onClick={() => setShowGpaDialog(false)}
              >
                Stay at normal load
              </Button>

              <Button
                className="rounded-xl font-bold bg-violet-600 hover:bg-violet-700"
                onClick={handleGpaContinue}
              >
                Check GPA
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MeetingList({ meetings }: { meetings: Meeting[] }) {
  return (
    <div className="mt-3 space-y-2">
      {meetings.map((meeting, idx) => (
        <div
          key={idx}
          className="rounded-xl bg-zinc-50 border border-zinc-100 p-3"
        >
          <div className="flex items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4 text-violet-500 shrink-0" />
            <span className="font-black text-zinc-800">
              {meeting.day}
            </span>
            <span className="text-zinc-500 font-semibold text-xs">
              P{meeting.period} ({formatTime(meeting.start_time)} -{" "}
              {formatTime(meeting.end_time)})
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

function SummaryPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-white/10 px-3 py-3">
      <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div className="text-sm font-black text-white mt-1">{value}</div>
    </div>
  );
}
