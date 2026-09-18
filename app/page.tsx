import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Zap, CalendarDays } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-fuchsia-50 flex flex-col items-center justify-center p-4 selection:bg-indigo-200">
      <div className="max-w-4xl w-full space-y-12 text-center">
        
        {/* Header Section */}
        <div className="space-y-6">
          <div className="flex justify-center mb-4">
            <div className="h-20 w-20 bg-gradient-to-tr from-violet-600 to-fuchsia-500 rounded-3xl flex items-center justify-center shadow-xl shadow-indigo-200 transform -rotate-6 hover:rotate-0 transition-all duration-300">
              <CalendarDays className="text-white h-10 w-10" />
            </div>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-fuchsia-600 pb-2">
            FCDS Timetable Builder
          </h1>
          
          <p className="text-xl md:text-2xl text-zinc-600 max-w-xl mx-auto font-medium">
            Your semester, your rules. <span className="font-bold text-violet-600">Zero clashes.</span> 🚀
          </p>
        </div>

        {/* Action Cards */}
        <div className="grid md:grid-cols-2 gap-6 pt-4 max-w-2xl mx-auto">
          
          <Card className="group hover:border-violet-300 hover:shadow-2xl hover:shadow-violet-200/50 transition-all duration-500 bg-white/60 backdrop-blur-sm border-2 rounded-3xl">
            <CardContent className="p-8 flex flex-col items-center space-y-4">
              <div className="p-4 bg-violet-100 rounded-full group-hover:bg-violet-600 group-hover:scale-110 transition-all duration-300 text-violet-600 group-hover:text-white">
                <Zap className="h-8 w-8" />
              </div>
              <h2 className="text-2xl font-bold text-zinc-800">Build Manually</h2>
              <p className="text-zinc-500 text-center font-medium">
                Pick your sections one by one. Play around until it fits perfectly.
              </p>
              <Link href="/build" className="w-full pt-4">
                <Button className="w-full font-bold text-md h-12 bg-zinc-900 hover:bg-violet-600 transition-all rounded-xl" size="lg">
                  Start Building
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="group hover:border-fuchsia-300 hover:shadow-2xl hover:shadow-fuchsia-200/50 transition-all duration-500 bg-white/60 backdrop-blur-sm border-2 rounded-3xl">
            <CardContent className="p-8 flex flex-col items-center space-y-4">
              <div className="p-4 bg-fuchsia-100 rounded-full group-hover:bg-fuchsia-500 group-hover:scale-110 transition-all duration-300 text-fuchsia-600 group-hover:text-white">
                <Sparkles className="h-8 w-8" />
              </div>
              <h2 className="text-2xl font-bold text-zinc-800">Auto-Magic</h2>
              <p className="text-zinc-500 text-center font-medium">
                Just select the courses you want. We'll generate all the valid combos.
              </p>
              <Link href="/combinations" className="w-full pt-4">
                <Button variant="outline" className="w-full font-bold text-md h-12 border-2 border-zinc-200 hover:border-fuchsia-500 hover:text-fuchsia-600 hover:bg-fuchsia-50 transition-all rounded-xl" size="lg">
                  Generate Combos
                </Button>
              </Link>
            </CardContent>
          </Card>

        </div>
      </div>
    </main>
  );
}