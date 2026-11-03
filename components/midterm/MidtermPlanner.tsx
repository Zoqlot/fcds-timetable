"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CalendarDays, Check, CheckCircle2,
  Download, Eye, LayoutGrid, ListOrdered, Loader2, Palette,
  RotateCcw, Search, Sparkles, WandSparkles, X, AlertTriangle,
  BookOpen, Image as ImageIcon, Type, SlidersHorizontal, Save, Trash2, Undo2, Redo2
} from "lucide-react";
import type { DesignSettings, MidtermExam, MidtermPreferences, SavedStyle, ThemeColors } from "@/lib/midterm/types";
import { DEFAULT_SETTINGS, SIZE_PRESETS, THEMES } from "@/lib/midterm/presets";
import { dayLabel, findExamConflicts, sortExams, timeLabel } from "@/lib/midterm/conflicts";
import { loadPreferences, savePreferences } from "@/lib/midterm/storage";
import { downloadCanvasAsJpg } from "@/lib/midterm/export-jpg";
import TimetableCanvas from "./TimetableCanvas";

type Props = { sessionId: string; sessionName: string; exams: MidtermExam[] };
type Tab = "layout" | "colors" | "appearance" | "content" | "export";

const tabItems: { id: Tab; label: string; icon: typeof LayoutGrid }[] = [
  { id: "layout", label: "Layout", icon: LayoutGrid },
  { id: "colors", label: "Colors", icon: Palette },
  { id: "appearance", label: "Style", icon: SlidersHorizontal },
  { id: "content", label: "Text", icon: Type },
  { id: "export", label: "Export", icon: ImageIcon },
];

const colorNames: { key: keyof ThemeColors; label: string }[] = [
  { key: "background", label: "Page background" },
  { key: "header", label: "Header background" },
  { key: "title", label: "Main title" },
  { key: "subtitle", label: "Subtitle" },
  { key: "card", label: "Exam card" },
  { key: "cardText", label: "Course text" },
  { key: "date", label: "Date label" },
  { key: "timeBadge", label: "Time badge" },
  { key: "timeText", label: "Time text" },
  { key: "accent", label: "Accent / decoration" },
  { key: "border", label: "Borders" },
  { key: "secondaryText", label: "Secondary text" },
];

const buttonClass = "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40";
const primaryClass = buttonClass + " bg-violet-600 text-white shadow-sm hover:bg-violet-700";
const secondaryClass = buttonClass + " border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50";
const inputClass = "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100";

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex cursor-pointer items-center justify-between gap-3 py-1.5 text-sm text-zinc-700">
      <span>{label}</span>
      <button type="button" role="switch" aria-label={label} aria-checked={checked} onClick={() => onChange(!checked)}
        className={"relative h-6 w-11 shrink-0 rounded-full transition " + (checked ? "bg-violet-600" : "bg-zinc-200")}>
        <span className={"absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all " + (checked ? "left-6" : "left-1")} />
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-xs font-semibold text-zinc-500">{label}</span>{children}</label>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3 border-b border-zinc-100 pb-4 last:border-0 last:pb-0"><h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">{title}</h3>{children}</section>;
}

function Segmented<T extends string>({
  value, options, onChange
}: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1">
    {options.map((option) => <button key={option.value} type="button" onClick={() => onChange(option.value)}
      className={"rounded-lg px-2 py-2 text-xs font-semibold transition " + (value === option.value ? "bg-white text-violet-700 shadow-sm" : "text-zinc-500 hover:text-zinc-800")}>
      {option.label}
    </button>)}
  </div>;
}

export default function MidtermPlanner({ sessionId, sessionName, exams }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [step, setStep] = useState<"select" | "design">("select");
  const [activeTab, setActiveTab] = useState<Tab>("layout");
  const [query, setQuery] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [dayFilter, setDayFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [settings, setSettings] = useState<DesignSettings>(DEFAULT_SETTINGS);
  const [title, setTitle] = useState("MY MIDTERM EXAMS");
  const [subtitle, setSubtitle] = useState(sessionName.toUpperCase());
  const [footer, setFooter] = useState("Good luck with your exams!");
  const [studentName, setStudentName] = useState("");
  const [filename, setFilename] = useState("my-midterm-timetable");
  const [savedStyles, setSavedStyles] = useState<SavedStyle[]>([]);
  const [styleName, setStyleName] = useState("My style");
  const [undoStack, setUndoStack] = useState<DesignSettings[]>([]);
  const [redoStack, setRedoStack] = useState<DesignSettings[]>([]);
  const [ready, setReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const saved = loadPreferences(sessionId);
    if (saved) {
      setSelectedIds(saved.selectedExamIds ?? []);
      setSettings({ ...DEFAULT_SETTINGS, ...(saved.settings ?? {}), colors: { ...DEFAULT_SETTINGS.colors, ...(saved.settings?.colors ?? {}) } });
      setTitle(saved.title ?? "MY MIDTERM EXAMS");
      setSubtitle(saved.subtitle ?? sessionName.toUpperCase());
      setFooter(saved.footer ?? "Good luck with your exams!");
      setStudentName(saved.studentName ?? "");
      setSavedStyles(saved.savedStyles ?? []);
    }
    setReady(true);
  }, [sessionId, sessionName]);

  useEffect(() => {
    if (!ready) return;
    const preferences: MidtermPreferences = {
      selectedExamIds: selectedIds, settings, title, subtitle, footer,
      studentName, savedStyles
    };
    savePreferences(sessionId, preferences);
  }, [ready, sessionId, selectedIds, settings, title, subtitle, footer, studentName, savedStyles]);

  const selectedExams = useMemo(
    () => exams.filter((exam) => selectedIds.includes(exam.id)),
    [exams, selectedIds]
  );
  const orderedSelected = useMemo(
    () => sortExams(selectedExams, settings.order, settings.manualExamOrderIds),
    [selectedExams, settings.order, settings.manualExamOrderIds]
  );
  const conflicts = useMemo(() => findExamConflicts(selectedExams), [selectedExams]);
  const days = useMemo(() => Array.from(new Set(exams.map((exam) => exam.date))).sort(), [exams]);
  const visibleExams = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exams.filter((exam) => {
      const matchesQuery = !q || exam.courseName.toLowerCase().includes(q) || exam.courseCode.toLowerCase().includes(q);
      const matchesYear = yearFilter === "all" ||
        (yearFilter === "other" ? !exam.yearLevel : String(exam.yearLevel) === yearFilter);
      const matchesDay = dayFilter === "all" || exam.date === dayFilter;
      return matchesQuery && matchesYear && matchesDay;
    }).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.courseName.localeCompare(b.courseName));
  }, [exams, query, yearFilter, dayFilter]);

  const update = (patch: Partial<DesignSettings>) => {
    setUndoStack((past) => [...past.slice(-24), settings]);
    setRedoStack([]);
    setSettings((current) => ({ ...current, ...patch }));
  };
  const updateColor = (key: keyof ThemeColors, value: string) => {
    setUndoStack((past) => [...past.slice(-24), settings]);
    setRedoStack([]);
    setSettings((current) => ({
      ...current,
      theme: "custom",
      colors: { ...current.colors, [key]: value },
    }));
  };
  const chooseTheme = (id: string) => {
    const theme = THEMES.find((item) => item.id === id);
    if (theme) update({ theme: id, colors: theme.colors });
  };
  const undo = () => {
    if (!undoStack.length) return;
    setRedoStack((future) => [settings, ...future]);
    setSettings(undoStack[undoStack.length - 1]);
    setUndoStack((past) => past.slice(0, -1));
  };
  const redo = () => {
    if (!redoStack.length) return;
    setUndoStack((past) => [...past, settings]);
    setSettings(redoStack[0]);
    setRedoStack((future) => future.slice(1));
  };
  const resetDesign = () => {
    setUndoStack((past) => [...past.slice(-24), settings]);
    setRedoStack([]);
    setSettings(DEFAULT_SETTINGS);
    setTitle("MY MIDTERM EXAMS");
    setSubtitle(sessionName.toUpperCase());
    setFooter("Good luck with your exams!");
    setStudentName("");
  };
  const randomize = () => {
    const choices = THEMES.filter((item) => item.id !== settings.theme);
    const chosen = choices[Math.floor(Math.random() * choices.length)];
    chooseTheme(chosen.id);
    const shapes: DesignSettings["cardShape"][] = ["square", "rounded", "pill"];
    update({ cardShape: shapes[Math.floor(Math.random() * shapes.length)] });
  };
  const toggleExam = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const moveExam = (id: string, direction: -1 | 1) => {
    const index = settings.manualExamOrderIds.length
      ? settings.manualExamOrderIds.indexOf(id)
      : orderedSelected.findIndex((exam) => exam.id === id);
    const current = orderedSelected.map((exam) => exam.id);
    const from = index < 0 ? current.indexOf(id) : index;
    const to = Math.max(0, Math.min(current.length - 1, from + direction));
    if (from < 0 || from === to) return;
    const next = [...current];
    [next[from], next[to]] = [next[to], next[from]];
    update({ order: "manual", manualExamOrderIds: next });
  };
  const saveStyle = () => {
    const style: SavedStyle = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()),
      name: styleName.trim() || "My style",
      settings: JSON.parse(JSON.stringify(settings)) as DesignSettings,
      createdAt: Date.now(),
    };
    setSavedStyles((current) => [...current, style]);
    setNotice("Style saved on this device.");
  };
  const exportJpg = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedExams.length) return;
    setExportError("");
    setExporting(true);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await downloadCanvasAsJpg(canvas, { filename, quality: settings.quality });
      setNotice("Your JPG timetable is ready.");
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Could not export the JPG.");
    } finally {
      setExporting(false);
    }
  };
  const updateDimension = (key: "width" | "height", value: number) => {
    const safe = Math.max(320, Math.min(5000, Math.round(value || 320)));
    const ratio = settings.width / settings.height;
    const dimensions = key === "width"
      ? { width: safe, height: settings.lockAspectRatio ? Math.max(320, Math.min(5000, Math.round(safe / ratio))) : settings.height }
      : { height: safe, width: settings.lockAspectRatio ? Math.max(320, Math.min(5000, Math.round(safe * ratio))) : settings.width };
    const next = { ...dimensions, orientation: "custom" as const };
    if (next.width * next.height > 18000000) {
      setExportError("This size is too large. Keep the total below 18 megapixels.");
      return;
    }
    setExportError("");
    update(next);
  };
  const applySize = (preset: typeof SIZE_PRESETS[number]) => {
    update({ width: preset.width, height: preset.height, orientation: preset.orientation });
  };
  const years = [
    { value: "all", label: "All years" },
    { value: "1", label: "Year 1" },
    { value: "2", label: "Year 2" },
    { value: "3", label: "Year 3" },
    { value: "4", label: "Year 4" },
    { value: "other", label: "Shared / Other" },
  ];

  const renderLayoutTab = () => (
    <div className="space-y-5">
      <Section title="Composition">
        <Field label="Timetable template">
          <div className="grid grid-cols-2 gap-2">
            {([
              ["agenda", "Agenda", ListOrdered],
              ["day-columns", "Day columns", CalendarDays],
              ["calendar-grid", "Calendar grid", LayoutGrid],
              ["exam-cards", "Exam cards", BookOpen],
            ] as const).map(([value, label, Icon]) => (
              <button key={value} type="button" onClick={() => update({ template: value })}
                className={"flex items-center gap-2 rounded-xl border p-3 text-left text-xs font-semibold " + (settings.template === value ? "border-violet-400 bg-violet-50 text-violet-800" : "border-zinc-200 hover:bg-zinc-50")}>
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Page orientation">
          <Segmented value={settings.orientation} onChange={(value) => {
            if (value === "portrait") update({ orientation: value, width: 1080, height: 1527 });
            if (value === "landscape") update({ orientation: value, width: 1527, height: 1080 });
            if (value === "square") update({ orientation: value, width: 1080, height: 1080 });
            if (value === "custom") update({ orientation: value });
          }} options={[
            { value: "portrait", label: "Portrait" }, { value: "landscape", label: "Landscape" },
            { value: "square", label: "Square" }, { value: "custom", label: "Custom" },
          ]} />
        </Field>
        <Field label="Content direction">
          <Segmented value={settings.direction} onChange={(value) => update({ direction: value })}
            options={[{ value: "vertical", label: "Vertical" }, { value: "horizontal", label: "Horizontal" }]} />
        </Field>
      </Section>
      <Section title="Page size">
        <div className="grid grid-cols-2 gap-2">
          {SIZE_PRESETS.map((preset) => (
            <button key={preset.id} type="button" onClick={() => applySize(preset)}
              className={"rounded-xl border px-2.5 py-2 text-left text-xs font-semibold " + (settings.width === preset.width && settings.height === preset.height ? "border-violet-400 bg-violet-50 text-violet-800" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50")}>
              {preset.label}<span className="mt-0.5 block text-[10px] font-normal text-zinc-400">{preset.width} × {preset.height}</span>
            </button>
          ))}
        </div>
        {settings.orientation === "custom" && <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Width (px)"><input className={inputClass} type="number" min="320" max="5000" value={settings.width} onChange={(e) => updateDimension("width", Number(e.target.value))} /></Field>
            <Field label="Height (px)"><input className={inputClass} type="number" min="320" max="5000" value={settings.height} onChange={(e) => updateDimension("height", Number(e.target.value))} /></Field>
          </div>
          <Toggle label="Lock aspect ratio" checked={settings.lockAspectRatio} onChange={(value) => update({ lockAspectRatio: value })} />
        </div>}
        <Field label={"Page margins · " + settings.margins + " px"}>
          <input className="w-full accent-violet-600" type="range" min="24" max="110" value={settings.margins} onChange={(e) => update({ margins: Number(e.target.value) })} />
        </Field>
        <Field label="Card spacing"><select className={inputClass} value={settings.spacing} onChange={(e) => update({ spacing: e.target.value as DesignSettings["spacing"] })}>
          <option value="compact">Compact</option><option value="normal">Normal</option><option value="spacious">Spacious</option>
        </select></Field>
      </Section>
      <Section title="Ordering">
        <Field label="Exam order"><select className={inputClass} value={settings.order} onChange={(e) => update({ order: e.target.value as DesignSettings["order"] })}>
          <option value="chronological">Chronological</option><option value="alphabetical">Alphabetical</option><option value="manual">My manual order</option>
        </select></Field>
      </Section>
    </div>
  );

  const renderColorsTab = () => (
    <div className="space-y-5">
      <Section title="Theme presets">
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map((theme) => (
            <button key={theme.id} type="button" onClick={() => chooseTheme(theme.id)}
              className={"rounded-xl border p-2 text-left " + (settings.theme === theme.id ? "border-violet-500 ring-2 ring-violet-100" : "border-zinc-200")}>
              <div className="mb-2 flex h-8 overflow-hidden rounded-lg">
                <span className="flex-1" style={{ background: theme.colors.background }} />
                <span className="flex-1" style={{ background: theme.colors.header }} />
                <span className="flex-1" style={{ background: theme.colors.accent }} />
                <span className="flex-1" style={{ background: theme.colors.cardText }} />
              </div>
              <span className="text-[11px] font-semibold text-zinc-700">{theme.name}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={randomize} className={secondaryClass + " w-full"}><WandSparkles className="h-4 w-4" /> Randomize palette & shape</button>
      </Section>
      <Section title="Individual colors">
        <div className="grid grid-cols-2 gap-2">
          {colorNames.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 rounded-xl border border-zinc-200 p-2">
              <input aria-label={label} type="color" value={settings.colors[key]} onChange={(e) => updateColor(key, e.target.value)}
                className="h-8 w-8 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
              <span className="min-w-0"><span className="block truncate text-[11px] font-semibold text-zinc-700">{label}</span><span className="block text-[10px] text-zinc-400">{settings.colors[key].toUpperCase()}</span></span>
            </label>
          ))}
        </div>
      </Section>
    </div>
  );

  const renderAppearanceTab = () => (
    <div className="space-y-5">
      <Section title="Cards">
        <Field label="Card shape"><Segmented value={settings.cardShape} onChange={(value) => update({ cardShape: value })}
          options={[{ value: "square", label: "Square" }, { value: "rounded", label: "Rounded" }, { value: "pill", label: "Pill" }]} /></Field>
        <Field label={"Corner radius · " + settings.cardRadius + " px"}><input className="w-full accent-violet-600" type="range" min="0" max="48" value={settings.cardRadius} onChange={(e) => update({ cardRadius: Number(e.target.value) })} /></Field>
        <Field label={"Border width · " + settings.borderWidth + " px"}><input className="w-full accent-violet-600" type="range" min="0" max="8" value={settings.borderWidth} onChange={(e) => update({ borderWidth: Number(e.target.value) })} /></Field>
        <Field label="Shadow"><select className={inputClass} value={settings.shadow} onChange={(e) => update({ shadow: e.target.value as DesignSettings["shadow"] })}><option value="none">None</option><option value="subtle">Subtle</option><option value="strong">Strong</option></select></Field>
        <Field label="Accent decoration"><select className={inputClass} value={settings.decoration} onChange={(e) => update({ decoration: e.target.value as DesignSettings["decoration"] })}><option value="none">None</option><option value="left-stripe">Left stripe</option><option value="top-stripe">Top stripe</option></select></Field>
      </Section>
      <Section title="Page styling">
        <Field label="Background style"><Segmented value={settings.backgroundStyle} onChange={(value) => update({ backgroundStyle: value })}
          options={[{ value: "solid", label: "Solid" }, { value: "gradient", label: "Gradient" }, { value: "pattern", label: "Pattern" }]} /></Field>
        <Field label="Header style"><select className={inputClass} value={settings.headerStyle} onChange={(e) => update({ headerStyle: e.target.value as DesignSettings["headerStyle"] })}><option value="minimal">Minimal</option><option value="plain">Color band</option><option value="banner">Rounded banner</option></select></Field>
      </Section>
    </div>
  );

  const renderContentTab = () => (
    <div className="space-y-5">
      <Section title="Text content">
        <Field label="Main heading"><input className={inputClass} maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Subtitle"><input className={inputClass} maxLength={90} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} /></Field>
        <Field label="Your name (optional)"><input className={inputClass} maxLength={45} placeholder="Add your name..." value={studentName} onChange={(e) => setStudentName(e.target.value)} /></Field>
        <Field label="Footer message"><input className={inputClass} maxLength={80} value={footer} onChange={(e) => setFooter(e.target.value)} /></Field>
      </Section>
      <Section title="Typography">
        <Field label="Font family"><select className={inputClass} value={settings.fontFamily} onChange={(e) => update({ fontFamily: e.target.value })}>
          <option value="Arial">Arial</option><option value="system-ui">System</option><option value="Verdana">Verdana</option><option value="Georgia">Georgia</option><option value="Trebuchet MS">Trebuchet MS</option><option value="Courier New">Courier New</option>
        </select></Field>
        <Field label={"Title size · " + settings.titleSize}><input className="w-full accent-violet-600" type="range" min="28" max="76" value={settings.titleSize} onChange={(e) => update({ titleSize: Number(e.target.value) })} /></Field>
        <Field label={"Course name size · " + settings.courseSize}><input className="w-full accent-violet-600" type="range" min="16" max="42" value={settings.courseSize} onChange={(e) => update({ courseSize: Number(e.target.value) })} /></Field>
        <Field label={"Date size · " + settings.dateSize}><input className="w-full accent-violet-600" type="range" min="12" max="30" value={settings.dateSize} onChange={(e) => update({ dateSize: Number(e.target.value) })} /></Field>
        <Field label={"Time size · " + settings.timeSize}><input className="w-full accent-violet-600" type="range" min="12" max="30" value={settings.timeSize} onChange={(e) => update({ timeSize: Number(e.target.value) })} /></Field>
        <Field label="Font weight"><Segmented value={settings.fontWeight} onChange={(value) => update({ fontWeight: value })}
          options={[{ value: "normal", label: "Normal" }, { value: "medium", label: "Medium" }, { value: "bold", label: "Bold" }]} /></Field>
        <Field label="Text alignment"><Segmented value={settings.textAlign} onChange={(value) => update({ textAlign: value })}
          options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]} /></Field>
      </Section>
      <Section title="Visible information">
        <Toggle label="Course code" checked={settings.showCourseCode} onChange={(value) => update({ showCourseCode: value })} />
        <Toggle label="Exam date" checked={settings.showDate} onChange={(value) => update({ showDate: value })} />
        <Toggle label="Day name" checked={settings.showDayName} onChange={(value) => update({ showDayName: value })} />
        <Toggle label="Exam time" checked={settings.showTime} onChange={(value) => update({ showTime: value })} />
        <Toggle label="Academic year label" checked={settings.showYearLabel} onChange={(value) => update({ showYearLabel: value })} />
        <Toggle label="FCDS label" checked={settings.showBrand} onChange={(value) => update({ showBrand: value })} />
        <Toggle label="Footer" checked={settings.showFooter} onChange={(value) => update({ showFooter: value })} />
      </Section>
    </div>
  );

  const renderExportTab = () => (
    <div className="space-y-5">
      <Section title="JPG output">
        <div className="rounded-xl bg-violet-50 p-3 text-xs text-violet-800">
          <div className="flex items-center gap-2 font-bold"><ImageIcon className="h-4 w-4" /> High-resolution JPG</div>
          <p className="mt-1 text-violet-700">The downloaded image contains only your timetable, not the editor or website controls.</p>
        </div>
        <Field label="File name"><input className={inputClass} value={filename} onChange={(e) => setFilename(e.target.value)} placeholder="my-midterm-timetable" /></Field>
        <Field label={"Image quality · " + settings.quality + "%"}><input className="w-full accent-violet-600" type="range" min="70" max="100" value={settings.quality} onChange={(e) => update({ quality: Number(e.target.value) })} /></Field>
        <div className="rounded-xl border border-zinc-200 p-3 text-xs text-zinc-500">
          <div className="flex justify-between"><span>Image dimensions</span><strong className="text-zinc-800">{settings.width} × {settings.height} px</strong></div>
          <div className="mt-1 flex justify-between"><span>Total pixels</span><strong className="text-zinc-800">{(settings.width * settings.height / 1000000).toFixed(2)} MP</strong></div>
        </div>
        <button type="button" disabled={exporting || !selectedExams.length} onClick={exportJpg} className={primaryClass + " w-full py-3"}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {exporting ? "Preparing JPG..." : "Download JPG"}
        </button>
        {exportError && <p role="alert" className="text-xs text-red-600">{exportError}</p>}
      </Section>
      <Section title="Save your design">
        <Field label="Style name"><input className={inputClass} value={styleName} onChange={(e) => setStyleName(e.target.value)} /></Field>
        <button type="button" onClick={saveStyle} className={secondaryClass + " w-full"}><Save className="h-4 w-4" /> Save current style</button>
        {savedStyles.length > 0 && <div className="space-y-2">
          {savedStyles.map((style) => <div key={style.id} className="flex items-center gap-2 rounded-xl border border-zinc-200 p-2">
            <button type="button" onClick={() => update({ ...style.settings })} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-xs font-semibold text-zinc-700">{style.name}</span><span className="text-[10px] text-zinc-400">Saved on this device</span>
            </button>
            <button type="button" aria-label={"Delete " + style.name} onClick={() => setSavedStyles((current) => current.filter((item) => item.id !== style.id))} className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
          </div>)}
        </div>}
      </Section>
    </div>
  );

  const renderActiveTab = () => {
    if (activeTab === "layout") return renderLayoutTab();
    if (activeTab === "colors") return renderColorsTab();
    if (activeTab === "appearance") return renderAppearanceTab();
    if (activeTab === "content") return renderContentTab();
    return renderExportTab();
  };

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" aria-label="Back to homepage" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm"><CalendarDays className="h-5 w-5" /></Link>
            <div className="min-w-0"><div className="truncate text-sm font-black tracking-tight">FCDS Midterm Planner</div><div className="truncate text-[11px] text-zinc-500">{sessionName}</div></div>
          </div>
          <div className="hidden items-center gap-1 rounded-full bg-zinc-100 p-1 sm:flex">
            <button type="button" onClick={() => setStep("select")} className={"rounded-full px-3 py-1.5 text-xs font-semibold " + (step === "select" ? "bg-white text-violet-700 shadow-sm" : "text-zinc-500")}>1. Select exams</button>
            <button type="button" disabled={!selectedIds.length} onClick={() => setStep("design")} className={"rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-30 " + (step === "design" ? "bg-white text-violet-700 shadow-sm" : "text-zinc-500")}>2. Design & export</button>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {step === "design" && <button type="button" onClick={resetDesign} className="hidden rounded-lg px-2 py-2 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 sm:inline-flex"><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Reset</button>}
            <Link href="/" className="hidden rounded-lg px-3 py-2 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 sm:block">Home</Link>
          </div>
        </div>
        <div className="flex border-t border-zinc-100 sm:hidden">
          <button type="button" onClick={() => setStep("select")} className={"flex-1 py-2.5 text-xs font-bold " + (step === "select" ? "border-b-2 border-violet-600 text-violet-700" : "text-zinc-400")}>01 · Select exams</button>
          <button type="button" disabled={!selectedIds.length} onClick={() => setStep("design")} className={"flex-1 py-2.5 text-xs font-bold disabled:opacity-30 " + (step === "design" ? "border-b-2 border-violet-600 text-violet-700" : "text-zinc-400")}>02 · Design & export</button>
        </div>
      </header>

      {step === "select" ? (
        <div className="mx-auto grid max-w-[1450px] gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-w-0 space-y-4">
            <div className="rounded-3xl bg-gradient-to-br from-violet-700 via-violet-600 to-fuchsia-600 p-6 text-white shadow-lg shadow-violet-200 sm:p-8">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold tracking-wide"><Sparkles className="h-3.5 w-3.5" /> YOUR PERSONAL EXAM SCHEDULE</div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Your exams. Your layout.</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-violet-100">Choose the subjects you are taking, then design a timetable that looks exactly how you want. Download it as a JPG and keep it with you.</p>
              <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-white/90"><span className="rounded-full bg-white/15 px-3 py-1.5">{exams.length} available exams</span><span className="rounded-full bg-white/15 px-3 py-1.5">{days.length} exam days</span><span className="rounded-full bg-white/15 px-3 py-1.5">Free JPG export</span></div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Choose your subjects</h2><p className="mt-0.5 text-xs text-zinc-500">You can mix courses from any academic year.</p></div><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">{selectedIds.length} selected</span></div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_145px_180px]">
                <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><input className={inputClass + " pl-9"} placeholder="Search subject or course code..." value={query} onChange={(e) => setQuery(e.target.value)} /></div>
                <select className={inputClass} value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>{years.map((year) => <option key={year.value} value={year.value}>{year.label}</option>)}</select>
                <select className={inputClass} value={dayFilter} onChange={(e) => setDayFilter(e.target.value)}><option value="all">All exam days</option>{days.map((day) => <option key={day} value={day}>{dayLabel(day)}</option>)}</select>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2"><span className="text-xs text-zinc-400">{visibleExams.length} matching subjects</span><button type="button" onClick={() => setSelectedIds((current) => Array.from(new Set([...current, ...visibleExams.map((exam) => exam.id)])))} className="text-xs font-bold text-violet-700 hover:text-violet-900">Select all visible</button></div>
              <div className="mt-3 divide-y divide-zinc-100">
                {visibleExams.map((exam) => {
                  const checked = selectedIds.includes(exam.id);
                  return <button key={exam.id} type="button" onClick={() => toggleExam(exam.id)} className={"flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-zinc-50 " + (checked ? "bg-violet-50/70" : "")}>
                    <span className={"flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border " + (checked ? "border-violet-600 bg-violet-600 text-white" : "border-zinc-300 bg-white text-transparent")}><Check className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-xs font-black uppercase tracking-wide text-violet-600">{exam.courseCode || "COURSE"}</span><span className="mt-0.5 block text-sm font-semibold text-zinc-800">{exam.courseName}</span><span className="mt-1 block text-[11px] text-zinc-500">{exam.yearLevel ? "Year " + exam.yearLevel + " · " : "Shared / Other · "}{dayLabel(exam.date)} · {timeLabel(exam.startTime)}</span></span>
                    <span className="hidden text-[11px] font-semibold text-zinc-400 sm:block">{timeLabel(exam.startTime)}–{timeLabel(exam.endTime)}</span>
                  </button>;
                })}
                {!visibleExams.length && <div className="py-12 text-center text-sm text-zinc-400">No subjects match these filters.</div>}
              </div>
            </div>
          </section>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between"><h2 className="font-bold">Your selected exams</h2><button type="button" onClick={() => setSelectedIds([])} disabled={!selectedIds.length} className="text-xs font-semibold text-red-500 disabled:opacity-30">Clear all</button></div>
              <p className="mt-1 text-xs text-zinc-500">This is the schedule that will appear in your image.</p>
              <div className="mt-3 space-y-2">
                {sortExams(selectedExams, "chronological", []).map((exam) => <div key={exam.id} className="flex items-start gap-2 rounded-xl bg-zinc-50 p-3">
                  <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-zinc-800">{exam.courseName}</p><p className="mt-1 text-[10px] text-zinc-500">{dayLabel(exam.date)} · {timeLabel(exam.startTime)}</p></div>
                  <button type="button" aria-label={"Remove " + exam.courseName} onClick={() => toggleExam(exam.id)} className="rounded-lg p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"><X className="h-4 w-4" /></button>
                </div>)}
                {!selectedExams.length && <div className="rounded-xl border border-dashed border-zinc-200 px-3 py-8 text-center"><BookOpen className="mx-auto h-6 w-6 text-zinc-300" /><p className="mt-2 text-xs font-semibold text-zinc-500">No exams selected yet</p><p className="mt-1 text-[11px] text-zinc-400">Choose subjects from the list.</p></div>}
              </div>
              {selectedExams.length > 0 && <div className="mt-3 border-t border-zinc-100 pt-3"><p className="mb-2 text-xs font-bold text-zinc-600">Schedule check</p>
                {conflicts.length ? <div className="space-y-2">{conflicts.map((conflict, index) => <div key={index} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900"><div className="mb-1 flex items-center gap-1.5 font-bold"><AlertTriangle className="h-3.5 w-3.5" />Time overlap</div>{conflict.first.courseName} and {conflict.second.courseName} overlap on {dayLabel(conflict.first.date, { month: "short", day: "numeric" })}.</div>)}</div>
                  : <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> No exam time conflicts detected.</div>}
              </div>}
              <button type="button" disabled={!selectedIds.length} onClick={() => setStep("design")} className={primaryClass + " mt-4 w-full justify-between py-3"}><span>Customize my timetable</span><ArrowRight className="h-4 w-4" /></button>
            </div>
            <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4 text-xs leading-5 text-violet-800"><strong>Made for every FCDS student.</strong><br />Pick courses across different years and programs. The year filter is only a browsing aid, not a restriction.</div>
          </aside>
        </div>
      ) : (
        <div className="mx-auto max-w-[1600px] px-3 py-4 sm:px-5 lg:px-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><button type="button" onClick={() => setStep("select")} className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:text-violet-900"><ArrowLeft className="h-3.5 w-3.5" />Back to subjects</button><h1 className="text-xl font-black tracking-tight">Make it yours.</h1><p className="text-xs text-zinc-500">{selectedExams.length} exams selected · Changes update your preview instantly.</p></div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={!undoStack.length} onClick={undo} className={secondaryClass} title="Undo"><Undo2 className="h-4 w-4" /></button>
              <button type="button" disabled={!redoStack.length} onClick={redo} className={secondaryClass} title="Redo"><Redo2 className="h-4 w-4" /></button>
              <button type="button" onClick={resetDesign} className={secondaryClass}><RotateCcw className="h-4 w-4" /><span className="hidden sm:inline">Reset design</span></button>
              <button type="button" onClick={exportJpg} disabled={exporting} className={primaryClass}>{exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Download JPG</button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[350px_minmax(0,1fr)]">
            <aside className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="grid grid-cols-5 border-b border-zinc-100">
                {tabItems.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setActiveTab(id)} className={"flex min-w-0 flex-col items-center gap-1 px-1 py-3 text-[10px] font-semibold " + (activeTab === id ? "border-b-2 border-violet-600 bg-violet-50/50 text-violet-700" : "text-zinc-400 hover:bg-zinc-50 hover:text-zinc-700")}><Icon className="h-4 w-4" /><span>{label}</span></button>)}
              </div>
              <div className="max-h-[calc(100vh-230px)] space-y-5 overflow-y-auto p-4">
                {renderActiveTab()}
              </div>
            </aside>

            <section className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2"><Eye className="h-4 w-4 text-violet-600" /><div><p className="text-sm font-bold">Live preview</p><p className="text-[11px] text-zinc-400">What you see here is what gets downloaded.</p></div></div>
                <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-500">{settings.width} × {settings.height} px <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">JPG</span></div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-[#e9e9ee] p-3 shadow-inner sm:p-6">
                <div className="mx-auto w-full" style={{ maxWidth: settings.width > settings.height ? "1200px" : "760px" }}>
                  <TimetableCanvas canvasRef={canvasRef} exams={orderedSelected} settings={settings} title={title} subtitle={subtitle} footer={settings.showFooter ? footer : ""} studentName={studentName} />
                </div>
              </div>
              {settings.order === "manual" && <div className="rounded-2xl border border-zinc-200 bg-white p-4"><div className="mb-3 flex items-center gap-2"><ListOrdered className="h-4 w-4 text-violet-600" /><p className="text-sm font-bold">Arrange your exams</p></div><div className="space-y-2">{orderedSelected.map((exam, index) => <div key={exam.id} className="flex items-center gap-2 rounded-xl bg-zinc-50 p-2"><span className="w-5 text-center text-xs font-bold text-zinc-400">{index + 1}</span><span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-700">{exam.courseName}</span><button type="button" disabled={index === 0} onClick={() => moveExam(exam.id, -1)} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white disabled:opacity-20" aria-label="Move up"><ArrowUp className="h-4 w-4" /></button><button type="button" disabled={index === orderedSelected.length - 1} onClick={() => moveExam(exam.id, 1)} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white disabled:opacity-20" aria-label="Move down"><ArrowDown className="h-4 w-4" /></button></div>)}</div></div>}
              {conflicts.length > 0 && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{conflicts.length} time overlap{conflicts.length === 1 ? "" : "s"} detected. They are still included in your timetable; please verify your selected subjects.</span></div>}
              {exportError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{exportError}</p>}
            </section>
          </div>
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/95 p-3 backdrop-blur sm:hidden">
            <div className="mx-auto flex max-w-2xl gap-2"><button type="button" onClick={() => setStep("select")} className={secondaryClass + " flex-1"}><BookOpen className="h-4 w-4" />Subjects</button><button type="button" disabled={exporting} onClick={exportJpg} className={primaryClass + " flex-1"}>{exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Download JPG</button></div>
          </div>
        </div>
      )}
      {notice && <div role="status" className="fixed bottom-5 right-5 z-50 rounded-xl bg-zinc-900 px-4 py-3 text-xs font-semibold text-white shadow-xl">{notice}<button type="button" onClick={() => setNotice("")} className="ml-3 text-zinc-300">Dismiss</button></div>}
    </main>
  );
}