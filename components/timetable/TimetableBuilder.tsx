"use client";

import { useState } from 'react';
import CourseBrowser from '@/components/courses/CourseBrowser';
import TimetableGrid from './TimetableGrid';
import { CalendarDays, Palette } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type TimetableEntry = {
  course_id: string;
  course_name: string;
  offering_id: string;
  meetings: any[];
};

export type TimetableTheme = {
  backgroundColor: string;
  columnHeaderColor: string;
  rowHeaderColor: string;
  lectureColor: string;
  sectionColor: string;
};

// Preset palettes matching the official schedule colors
export const PRESET_THEMES: Record<string, TimetableTheme> = {
  purple: {
    backgroundColor: "#c7bfe6",
    columnHeaderColor: "#a399ce",
    rowHeaderColor: "#b5abd9",
    lectureColor: "#8e7cc3",
    sectionColor: "#a294d1",
  },
  peach: {
    backgroundColor: "#fcd5cb",
    columnHeaderColor: "#f4b2a3",
    rowHeaderColor: "#f7c1b5",
    lectureColor: "#ea9999",
    sectionColor: "#f2a89b",
  },
  orange: {
    backgroundColor: "#f9cb9c",
    columnHeaderColor: "#f6b26b",
    rowHeaderColor: "#f7bc80",
    lectureColor: "#e69138",
    sectionColor: "#f3a558",
  },
  classic: {
    backgroundColor: "#cfe2f3",
    columnHeaderColor: "#9fc5e8",
    rowHeaderColor: "#b4d5f0",
    lectureColor: "#6fa8dc",
    sectionColor: "#8ebfe8",
  }
};

export default function TimetableBuilder({ semesterName, semesterCourses }: { semesterName: string, semesterCourses: any[] }) {
  const [track, setTrack] = useState<string>('GN');
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [theme, setTheme] = useState<TimetableTheme>(PRESET_THEMES.purple);

  const handleRemoveCourse = (courseId: string) => {
    setTimetable(prev => prev.filter(t => t.course_id !== courseId));
  };

  return (
    <>
      <div className="w-[380px] flex-shrink-0 h-full z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <CourseBrowser 
          semesterCourses={semesterCourses} 
          track={track}
          setTrack={setTrack}
          timetable={timetable}
          setTimetable={setTimetable}
        />
      </div>

      <div className="flex-1 h-full flex flex-col p-6 overflow-hidden bg-zinc-100">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-zinc-900">My Timetable</h1>
            <p className="text-zinc-500 font-medium text-xs mt-0.5">{semesterName} • {track} Track</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Color Settings Popover - FIXED HYDRATION ERROR HERE */}
            <Popover>
              <PopoverTrigger className="inline-flex items-center justify-center rounded-lg text-xs font-bold border border-zinc-300 bg-white text-zinc-700 shadow-sm hover:bg-zinc-100 hover:text-zinc-900 h-8 px-3 gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500">
                <Palette className="h-3.5 w-3.5 text-violet-600" />
                Colors
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4 bg-white rounded-2xl shadow-xl border-zinc-200" align="end">
                <h4 className="font-bold text-sm text-zinc-900 mb-3">Custom Timetable Colors</h4>
                
                {/* Presets */}
                <div className="mb-4">
                  <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">Theme Presets</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {Object.entries(PRESET_THEMES).map(([name, p]) => (
                      <button
                        key={name}
                        onClick={() => setTheme(p)}
                        className="h-8 rounded-lg border-2 border-black text-[11px] font-black capitalize transition-transform hover:scale-105"
                        style={{ backgroundColor: p.backgroundColor }}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Granular Color Pickers */}
                <div className="space-y-2.5 pt-2 border-t border-zinc-100">
                  <div className="flex justify-between items-center text-xs font-semibold text-zinc-700">
                    <span>Background Color</span>
                    <input 
                      type="color" 
                      value={theme.backgroundColor} 
                      onChange={(e) => setTheme({ ...theme, backgroundColor: e.target.value })}
                      className="h-6 w-10 border rounded cursor-pointer"
                    />
                  </div>
                  <div className="flex justify-between items-center text-xs font-semibold text-zinc-700">
                    <span>Period Header Color</span>
                    <input 
                      type="color" 
                      value={theme.columnHeaderColor} 
                      onChange={(e) => setTheme({ ...theme, columnHeaderColor: e.target.value })}
                      className="h-6 w-10 border rounded cursor-pointer"
                    />
                  </div>
                  <div className="flex justify-between items-center text-xs font-semibold text-zinc-700">
                    <span>Day Row Header Color</span>
                    <input 
                      type="color" 
                      value={theme.rowHeaderColor} 
                      onChange={(e) => setTheme({ ...theme, rowHeaderColor: e.target.value })}
                      className="h-6 w-10 border rounded cursor-pointer"
                    />
                  </div>
                  <div className="flex justify-between items-center text-xs font-semibold text-zinc-700">
                    <span>Lecture Card Color</span>
                    <input 
                      type="color" 
                      value={theme.lectureColor} 
                      onChange={(e) => setTheme({ ...theme, lectureColor: e.target.value })}
                      className="h-6 w-10 border rounded cursor-pointer"
                    />
                  </div>
                  <div className="flex justify-between items-center text-xs font-semibold text-zinc-700">
                    <span>Section / Lab Color</span>
                    <input 
                      type="color" 
                      value={theme.sectionColor} 
                      onChange={(e) => setTheme({ ...theme, sectionColor: e.target.value })}
                      className="h-6 w-10 border rounded cursor-pointer"
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <div className="px-3 py-1.5 bg-white border border-zinc-300 rounded-lg text-xs font-bold text-zinc-700 shadow-sm">
              {timetable.length} Subjects
            </div>
          </div>
        </div>

        {timetable.length === 0 ? (
          <div className="flex-1 bg-white border-2 border-dashed border-zinc-200 rounded-2xl flex flex-col items-center justify-center text-center p-8 shadow-sm">
            <div className="h-16 w-16 bg-violet-50 rounded-full flex items-center justify-center mb-3">
              <CalendarDays className="h-8 w-8 text-violet-400" />
            </div>
            <h3 className="text-lg font-bold text-zinc-700">Your week is empty</h3>
            <p className="text-zinc-500 max-w-sm mt-1 text-xs">
              Search for your subjects on the left and hit the plus icon to build your schedule.
            </p>
          </div>
        ) : (
          <TimetableGrid 
            timetable={timetable} 
            theme={theme} 
            onRemove={handleRemoveCourse} 
          />
        )}
      </div>
    </>
  );
}