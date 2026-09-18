"use client";

import { TimetableEntry, TimetableTheme } from "./TimetableBuilder";
import { Trash2, MapPin, User } from "lucide-react";
import { formatInstructorName } from "@/lib/utils";

const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
const PERIODS = [
  { id: 1, label: "8:30 - 10:30" },
  { id: 2, label: "10:30 - 12:30" },
  { id: 3, label: "12:30 - 2:30" },
  { id: 4, label: "2:30 - 4:30" },
  { id: 5, label: "4:30 - 6:30" },
  { id: 6, label: "6:30 - 8:30" },
];

export default function TimetableGrid({ 
  timetable, theme, onRemove 
}: { 
  timetable: TimetableEntry[]; theme: TimetableTheme; onRemove: (id: string) => void;
}) {
  const grid: Record<string, Record<number, { entry: TimetableEntry; meeting: any }>> = {};
  
  DAYS.forEach(day => {
    grid[day] = {};
    timetable.forEach(entry => {
      entry.meetings.forEach(meeting => {
        if (meeting.day === day) grid[day][meeting.period] = { entry, meeting };
      });
    });
  });

  return (
    <div className="flex-1 overflow-auto rounded-3xl shadow-sm border border-zinc-200 bg-white/50 backdrop-blur-sm p-4">
      <div className="min-w-[1100px] w-full flex flex-col gap-3">
        
        <div className="grid grid-cols-[100px_repeat(6,1fr)] gap-3 mb-2">
          <div className="flex items-end justify-center pb-2">
            <span className="text-[10px] font-black tracking-widest uppercase text-zinc-400">Day \ Time</span>
          </div>
          {PERIODS.map(period => (
            <div 
              key={period.id} 
              className="py-3 px-2 text-center rounded-2xl shadow-sm border border-black/5"
              style={{ backgroundColor: theme.columnHeaderColor }}
            >
              <div className="text-[10px] font-black uppercase tracking-widest text-black/50 mb-0.5">Period {period.id}</div>
              <div className="text-sm font-bold text-black/80">{period.label}</div>
            </div>
          ))}
        </div>

        {DAYS.map(day => {
          const dayHasAnyClasses = PERIODS.some(p => grid[day]?.[p.id]);

          return (
            <div key={day} className="grid grid-cols-[100px_repeat(6,1fr)] gap-3 min-h-[120px]">
              
              <div 
                className="flex items-center justify-center rounded-2xl shadow-sm border border-black/5 p-4 relative overflow-hidden"
                style={{ backgroundColor: theme.rowHeaderColor }}
              >
                <div className="absolute inset-0 bg-white/20 mix-blend-overlay" />
                <span className="relative font-black text-black/80 tracking-wide text-sm -rotate-90 sm:rotate-0">{day}</span>
              </div>

              {PERIODS.map(period => {
                const cellData = grid[day]?.[period.id];

                if (!dayHasAnyClasses && period.id === 1) {
                  return (
                    <div 
                      key="empty-day" 
                      className="col-span-6 rounded-2xl border-2 border-dashed border-zinc-200 flex items-center justify-center opacity-60"
                      style={{
                        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, #f4f4f5 10px, #f4f4f5 20px)'
                      }}
                    >
                      <span className="bg-white/80 backdrop-blur-md px-4 py-1.5 rounded-full text-xs font-bold text-zinc-400 uppercase tracking-widest">
                        No Classes
                      </span>
                    </div>
                  );
                }
                if (!dayHasAnyClasses && period.id !== 1) return null;

                if (!cellData) {
                  return <div key={period.id} className="rounded-2xl border-2 border-dashed border-zinc-100 bg-zinc-50/50" />;
                }

                const isLecture = cellData.meeting.meeting_type?.toLowerCase() === 'lecture';
                const cellBg = isLecture ? theme.lectureColor : theme.sectionColor;

                return (
                  <div 
                    key={period.id} 
                    className="relative group rounded-2xl p-3.5 flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-xl border border-black/5"
                    style={{ backgroundColor: cellBg }}
                  >
                    <button
                      onClick={() => onRemove(cellData.entry.course_id)}
                      className="absolute top-2 right-2 p-1.5 bg-white/60 backdrop-blur-md hover:bg-red-500 hover:text-white text-zinc-600 rounded-lg opacity-0 group-hover:opacity-100 transition-all z-20 shadow-sm"
                      title="Remove from Timetable"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>

                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="bg-white/50 backdrop-blur-sm px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest text-black/70">
                        {cellData.meeting.meeting_type}
                      </div>
                    </div>

                    <div className="font-bold text-[13px] leading-tight text-black/90 mb-auto pr-6">
                      {cellData.entry.course_name}
                    </div>
                    
                    <div className="mt-3 space-y-1.5 bg-white/40 backdrop-blur-sm rounded-xl p-2 border border-white/20">
                      <div className="flex items-center gap-2 text-[11px] font-semibold text-black/70">
                        <MapPin className="h-3 w-3 opacity-70" />
                        <span className="truncate">{cellData.meeting.location || "TBA"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] font-semibold text-black/70">
                        <User className="h-3 w-3 opacity-70" />
                        {/* The formatter fixes the names on the final grid too! */}
                        <span className="truncate">{formatInstructorName(cellData.meeting.instructor)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}