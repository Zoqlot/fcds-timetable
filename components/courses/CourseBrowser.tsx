"use client";

import { useState } from 'react';
import { Search, Plus, ChevronUp, ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import SectionSelector from './SectionSelector';
import { TimetableEntry } from '../timetable/TimetableBuilder';

export default function CourseBrowser({ 
  semesterCourses, track, setTrack, timetable, setTimetable 
}: { 
  semesterCourses: any[], track: string, setTrack: (t: string) => void,
  timetable: TimetableEntry[], setTimetable: any 
}) {
  const [search, setSearch] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<any | null>(null);
  
  // Accordion state for Years 1 through 4 (all open by default)
  const [expandedYears, setExpandedYears] = useState<Record<number, boolean>>({ 1: true, 2: true, 3: true, 4: true });
  
  const tracks = ['GN', 'CY', 'AI', 'BA'];
  const levels = [1, 2, 3, 4];

  const toggleYear = (year: number) => {
    setExpandedYears(prev => ({ ...prev, [year]: !prev[year] }));
  };

  // Filter courses by search input
  const searchedCourses = semesterCourses.filter(sc => 
    sc.courses.name.toLowerCase().includes(search.toLowerCase()) ||
    (sc.source_code && sc.source_code.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="flex flex-col h-full w-full bg-white border-r border-zinc-200 overflow-hidden">
      
      {/* Top Specialization & Search Header */}
      <div className="p-4 sm:p-5 border-b border-zinc-100 space-y-4 shrink-0 bg-white">
        <div>
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2 block">Specialization Track</label>
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

      {/* Accordion Course List with proper mobile scroll padding */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-zinc-50/30 pb-28">
        {levels.map(level => {
          const coursesInLevel = searchedCourses.filter(sc => 
            sc.offerings.some((off: any) => off.track === track && off.eligible_years.includes(level))
          );

          if (coursesInLevel.length === 0) return null;

          return (
            <div key={level} className="mb-6">
              <button 
                onClick={() => toggleYear(level)}
                className="flex items-center justify-between w-full pb-2 mb-3 border-b border-zinc-200 group"
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
                <div className="space-y-3 animate-in slide-in-from-top-2 fade-in duration-200">
                  {coursesInLevel.map(sc => (
                    <Card 
                      key={sc.id} 
                      onClick={() => setSelectedCourse(sc)}
                      className="p-3.5 hover:border-violet-300 hover:shadow-md cursor-pointer transition-all group border-zinc-200 active:scale-[0.99]"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <div className="text-[11px] font-black text-violet-600 mb-1 tracking-widest uppercase">
                            {sc.source_code || "MATH0 / ELEC"}
                          </div>
                          <h3 className="font-semibold text-sm text-zinc-800 leading-tight group-hover:text-violet-700 transition-colors">
                            {sc.courses.name}
                          </h3>
                        </div>
                        <button className="h-7 w-7 flex-shrink-0 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 group-hover:bg-violet-600 group-hover:text-white transition-colors">
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {searchedCourses.filter(sc => sc.offerings.some((off: any) => off.track === track)).length === 0 && (
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