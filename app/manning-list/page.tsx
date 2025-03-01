'use client'

import { createBrowserClient } from '@supabase/ssr'
import { useEffect, useState } from 'react'
import { Search, Plus, Calendar, Users, List, Grid } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import ManningStatistics from "../components/manning/ManningStatistics"
import { DailyStatistics } from "../types/manning"
import PersonnelList from "../components/manning/PersonnelList"
import { cn } from "@/lib/utils"

// Types
interface DutyInfo {
  duty_section_commander: string;
  date: string;
}

interface DailyStats {
  total_strength: number;
  current_duty_ops: number;
  leave_count: number;
  mc_count: number;
}

interface Personnel {
  serial_no: number;
  rank: string;
  name: string;
  role: string;
  status: string;
  grouping: string;
}

// Update types to match database schema
interface VehicleAssignment {
  id: string;
  vehicle_type: 'MRV811' | 'LF811' | 'RFV811';
  section: string;
  position: string;
  personnel_name: string;
  created_at: string;
}

type MRVSection = 'COMMAND' | 'BRIDGE' | 'FIREFIGHTING' | 'DECK' | 'RESCUE';

interface SectionDefinition {
  title: string;
  displayTitle: string;
  positions: string[];
  positionMap?: Record<string, string>;
}

interface ManningStatisticsProps {
  statistics: DailyStatistics;
}

export default function ManningList() {
  const [dutyInfo, setDutyInfo] = useState<DutyInfo | null>(null);
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [assignments, setAssignments] = useState<{[key: string]: VehicleAssignment[]}>({});
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0])
  const [personnel, setPersonnel] = useState<Personnel[]>([])
  const [view, setView] = useState<'list' | 'grouped'>('grouped')
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    }
  );

  useEffect(() => {
    async function fetchData() {
      // Fetch duty info
      const { data: dutyData } = await supabase
        .from('duty_info')
        .select('*')
        .single();
      setDutyInfo(dutyData);

      // Fetch daily statistics
      const { data: statsData } = await supabase
        .from('daily_statistics')
        .select('*')
        .single();
      setStats(statsData);

      // Fetch vehicle assignments
      const { data: assignmentData } = await supabase
        .from('vehicle_assignments')
        .select('*')
        .order('vehicle_type')
        .order('section')
        .order('position');

      if (assignmentData) {
        // Group assignments by exact vehicle type
        const grouped = assignmentData.reduce<{[key: string]: VehicleAssignment[]}>((acc, curr) => {
          const key = curr.vehicle_type;
          if (!acc[key]) {
            acc[key] = [];
          }
          acc[key].push(curr);
          return acc;
        }, {
          'MRV811': [],
          'LF811': [],
          'LF812': [],
          'RFV811': []
        });

        setAssignments(grouped);
      }

      // Fetch personnel
      const { data: personnelData, error: personnelError } = await supabase
        .from('personnel')
        .select('*')
        .order('serial_no');

      if (!personnelError && personnelData) {
        setPersonnel(personnelData);
      }
    }

    fetchData();

    // Set up real-time subscriptions
    const dutyChannel = supabase
      .channel('duty_info_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'duty_info'
        },
        async (payload) => {
          console.log('Duty info changed:', payload);
          const { data } = await supabase
            .from('duty_info')
            .select('*')
            .single();
          if (data) setDutyInfo(data);
        }
      )
      .subscribe();

    const statsChannel = supabase
      .channel('daily_stats_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_statistics'
        },
        async (payload) => {
          console.log('Stats changed:', payload);
          const { data } = await supabase
            .from('daily_statistics')
            .select('*')
            .single();
          if (data) setStats(data);
        }
      )
      .subscribe();

    const personnelChannel = supabase
      .channel('personnel_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'personnel'
        },
        async (payload) => {
          console.log('Personnel changed:', payload);
          const { data } = await supabase
            .from('personnel')
            .select('*')
            .order('serial_no');
          if (data) setPersonnel(data);
        }
      )
      .subscribe();

    const assignmentsChannel = supabase
      .channel('vehicle_assignments_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vehicle_assignments'
        },
        async (payload) => {
          console.log('Assignments changed:', payload);
          const { data } = await supabase
            .from('vehicle_assignments')
            .select('*')
            .order('vehicle_type')
            .order('section')
            .order('position');
          
          if (data) {
            const grouped = data.reduce<{[key: string]: VehicleAssignment[]}>((acc, curr) => {
              const key = curr.vehicle_type;
              if (!acc[key]) {
                acc[key] = [];
              }
              acc[key].push(curr);
              return acc;
            }, {
              'MRV811': [],
              'LF811': [],
              'LF812': [],
              'RFV811': []
            });
            
            setAssignments(grouped);
          }
        }
      )
      .subscribe();

    // Cleanup subscriptions on unmount
    return () => {
      supabase.removeChannel(dutyChannel);
      supabase.removeChannel(statsChannel);
      supabase.removeChannel(personnelChannel);
      supabase.removeChannel(assignmentsChannel);
    };
  }, [supabase]);

  // Add type for the event handler
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDateFilter(e.target.value);
  };

  const renderRegularVehicle = (vehicleType: string, vehicleAssignments: VehicleAssignment[]) => {
    // Define standard positions for LF vehicles with the correct positions
    const standardPositions = ['SC', 'PO', 'FF1', 'FF2'];

    return (
      <div className="p-3 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-sm bg-white dark:bg-[#2E2521]/80 shadow-sm">
        <div className="grid grid-cols-4 gap-4">
          {standardPositions.map(position => (
            <div key={position} className="space-y-2">
              <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                {position}
              </div>
              <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px]">
                {vehicleAssignments.find(a => a.position === position)?.personnel_name || '-'}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderRFV811 = (vehicleAssignments: VehicleAssignment[]) => {
    // Define positions for each row
    const firstRowPositions = ['OOW', 'ENG/EMT', 'STEERSMAN'];
    const secondRowPositions = ['NAV', 'FF1', 'FF2'];
    
    return (
      <div className="p-3 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-sm bg-white dark:bg-[#2E2521]/80 shadow-sm">
        
        {/* First Row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {firstRowPositions.map(position => (
            <div key={position} className="space-y-2">
              <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                {position}
              </div>
              <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px]">
                {vehicleAssignments.find(a => a.position === position)?.personnel_name || '-'}
              </div>
            </div>
          ))}
        </div>
        
        {/* Second Row */}
        <div className="grid grid-cols-3 gap-4">
          {secondRowPositions.map(position => (
            <div key={position} className="space-y-2">
              <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                {position}
              </div>
              <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px]">
                {vehicleAssignments.find(a => a.position === position)?.personnel_name || '-'}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderMRV811Sections = (assignments: VehicleAssignment[]) => {
    // Debug logs
    console.log('All MRV811 assignments:', assignments);
    
    // Filter assignments by section
    const commandAssignments = assignments.filter(a => a.section === 'COMMAND');
    const nonCommandAssignments = assignments.filter(a => a.section !== 'COMMAND');
    
    // Define all required sections with their titles and positions
    const requiredSections: SectionDefinition[] = [
      {
        title: "BRIDGE",
        displayTitle: "BRIDGE CREW",
        positions: ["OOW", "ENG/EMT", "STEERSMAN", "NAV SPEC"]
      },
      {
        title: "SECTION 1",
        displayTitle: "SECTION 1 (FIREFIGHTING CREW)",
        positions: ["SC", "FF1", "FF2", "FF3", "FF4", "FF5"]
      },
      {
        title: "SECTION 2",
        displayTitle: "SECTION 2 (DECK CREW / MOORING PARTY)",
        positions: ["FF1", "FF2", "FF3", "FF4", "FF5", "FF6"],
        positionMap: { "SC": "FF1" }
      },
      {
        title: "SECTION 3",
        displayTitle: "SECTION 3 (RESCUE & EVACUATION TEAM)",
        positions: ["SC", "FF1", "FF2", "FF3", "FF4", "FF5"]
      }
    ];

    return (
      <div className="border border-neutral-200 dark:border-[#FCF6EC]/20 rounded-md overflow-hidden">
        <div className="bg-gray-100 dark:bg-[#2E2521] px-4 py-2">
          <h3 className="font-semibold">Red Dolphin MRV811</h3>
            </div>
        <div className="space-y-3 p-3">
          {/* Commander Section */}
          <div className="rounded-md overflow-hidden">
            <div className="border border-neutral-200 dark:border-[#FCF6EC]/10">
              <Table>
                <TableHeader>
                  <TableRow className="bg-white dark:bg-[#2E2521] border-b border-neutral-200 dark:border-[#FCF6EC]/20">
                    <TableHead className="py-2 px-3 text-xs font-medium text-neutral-600 dark:text-[#FCF6EC]/70">
                      Duty Officer
                      </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="hover:bg-neutral-50 dark:hover:bg-[#FCF6EC]/5">
                    <TableCell className="px-3 py-2">
                      <div className="text-xs text-neutral-900 dark:text-[#FCF6EC]">
                        {commandAssignments.find(a => a.position === 'Duty Officer')?.personnel_name || '-'}
                      </div>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Required Sections */}
          {requiredSections.map((section) => {
            // Get assignments for this section
            const sectionAssignments = nonCommandAssignments.filter(a => a.section === section.title);
            
            // Get positions that have assignments
            const filledPositions = section.positions.filter(pos => {
              const searchPos = section.positionMap?.[pos] || pos;
              return sectionAssignments.some(a => a.position === searchPos);
            });

            return (
              <div key={section.title} className="rounded-md overflow-hidden">
                <div className="bg-gray-100 dark:bg-[#2E2521] px-4 py-2">
                  <h4 className="text-xs font-medium text-neutral-900 dark:text-[#FCF6EC]">
                    {section.displayTitle}
                  </h4>
                </div>
                <div className="border border-neutral-200 dark:border-[#FCF6EC]/10 border-t-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-white dark:bg-[#2E2521] border-b border-neutral-200 dark:border-[#FCF6EC]/20">
                        {filledPositions.map((pos) => (
                          <TableHead key={pos} className="py-2 px-3 text-xs font-medium text-neutral-600 dark:text-[#FCF6EC]/70">
                            {pos}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow className="bg-gray-200 dark:bg-[#2E2521]/80 hover:bg-gray-100 dark:hover:bg-[#FCF6EC]/5">
                        {filledPositions.map((pos) => {
                          const searchPos = section.positionMap?.[pos] || pos;
                          const assignment = sectionAssignments.find(a => a.position === searchPos);
                      return (
                            <TableCell key={pos} className="px-3 py-2">
                              <div className="text-xs text-neutral-900 dark:text-[#FCF6EC]">
                                {assignment?.personnel_name || '-'}
                              </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full bg-gray-50 dark:bg-[#1C1917] font-['Azeret_Mono']">
      {/* Decorative Elements */}
      <div className="fixed top-6 left-6 w-1.5 h-1.5 rounded-full bg-gray-900 dark:bg-[#FCF6EC]" />
      <div className="fixed top-6 right-6 w-1.5 h-1.5 rounded-full bg-gray-900 dark:bg-[#FCF6EC]" />

      <div className="max-w-[1920px] mx-auto relative">
        {/* Header */}
        <header className="px-6 pt-6 pb-6 border-b border-gray-200 dark:border-[#FCF6EC]/20">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="space-y-1">
                <span className="text-[10px] tracking-[0.2em] text-gray-500 uppercase block">Fire Check</span>
                <h1 className="text-[32px] font-normal tracking-[-0.02em] text-gray-900 dark:text-[#FCF6EC] uppercase">Manning List</h1>
              </div>
              <span className="text-[10px] tracking-[0.2em] text-gray-500 dark:text-[#FCF6EC]/60 uppercase">Personnel Duty Roster</span>
            </div>
            
            {/* Stats Overview - Moved above search bar */}
            <div className="grid grid-cols-4 gap-16 max-w-7xl mx-auto py-6 mb-6">
              <StatCard title="TOTAL STRENGTH" value={stats?.total_strength.toString() || '0'} />
              <StatCard title="CURRENT DUTY OPS" value={stats?.current_duty_ops.toString() || '0'} />
              <StatCard title="ON LEAVE" value={stats?.leave_count.toString() || '0'} />
              <StatCard title="COURSE/MC" value={stats?.mc_count.toString() || '0'} />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <Input 
                  type="search" 
                  placeholder="Search personnel..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-neutral-50 dark:bg-[#1C1917] border-0 w-full focus-visible:ring-neutral-900"
                />
              </div>

              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={dateFilter}
                  onChange={handleDateChange}
                  className="w-[160px] bg-neutral-50 dark:bg-[#1C1917] border-0 focus-visible:ring-neutral-900 text-xs font-['Azeret_Mono']"
                />
                
                <Dialog>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline"
                      className="h-8 px-3 rounded-md transition-colors text-xs tracking-wide border border-gray-200 dark:border-[#FCF6EC]/20 flex items-center gap-1"
                    >
                      <Users className="h-3.5 w-3.5" />
                      <span>Personnel</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Personnel List</DialogTitle>
                    </DialogHeader>
                    <PersonnelList personnel={personnel} />
                  </DialogContent>
                </Dialog>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline"
                      className="h-8 px-3 rounded-md transition-colors text-xs tracking-wide border border-gray-200 dark:border-[#FCF6EC]/20 flex items-center gap-1"
                    >
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        width="14" 
                        height="14" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        className="text-gray-900 dark:text-[#FCF6EC]"
                      >
                        <line x1="18" y1="20" x2="18" y2="10"></line>
                        <line x1="12" y1="20" x2="12" y2="4"></line>
                        <line x1="6" y1="20" x2="6" y2="14"></line>
                      </svg>
                      <span>Stats</span>
          </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Manning Statistics</DialogTitle>
                    </DialogHeader>
                    <ManningStatistics statistics={stats as DailyStatistics} />
                  </DialogContent>
                </Dialog>
                
                <Button 
                  className="bg-neutral-900 hover:bg-neutral-800 dark:bg-[#2E2521] dark:hover:bg-[#2E2521]/80 font-['Azeret_Mono'] h-9 px-3 rounded-md transition-colors text-xs tracking-wide border border-gray-200 dark:border-[#FCF6EC]/20 flex items-center gap-1"
                >
                  <Plus className="h-4 w-4 text-white dark:text-[#FCF6EC]" /> 
                  <span className="text-white dark:text-[#FCF6EC]">Add Personnel</span>
                </Button>
              </div>
            </div>
            
            {/* Duty Info - Moved below search bar */}
            <div className="max-w-7xl mx-auto mt-6 mb-4">
              <Card className="shadow-sm border border-gray-200 dark:border-[#FCF6EC]/20 bg-white dark:bg-[#2E2521]">
                <CardContent className="pt-4 pb-2">
                  <div className="grid gap-2 md:grid-cols-2">
                <div>
                      <h2 className="text-xs font-medium text-gray-500 dark:text-[#FCF6EC]/60 mb-1">
                        Duty Section Commander
                      </h2>
                      <p className="text-sm font-medium text-gray-900 dark:text-[#FCF6EC]">
                        {dutyInfo?.duty_section_commander || '-'}
                      </p>
                </div>
                <div>
                      <h2 className="text-xs font-medium text-gray-500 dark:text-[#FCF6EC]/60 mb-1">
                        Duty Date
                      </h2>
                      <p className="text-sm font-medium text-gray-900 dark:text-[#FCF6EC]">
                    {dutyInfo?.date ? new Date(dutyInfo.date).toLocaleDateString('en-GB', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                      year: 'numeric'
                    }) : '-'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="px-6 pb-6 mt-4">
          {/* Vehicle Assignments Section - Updated styling to match BA List */}
          <div className="space-y-6">
            {Object.entries(assignments).map(([vehicleType, vehicleAssignments]) => (
              <div key={vehicleType} className="bg-gray-200 dark:bg-[#2E2521] rounded-md overflow-hidden border border-gray-200 dark:border-[#FCF6EC]/20">
                <h3 className="text-xs tracking-[0.2em] uppercase font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] px-4 py-3 border-b border-gray-200 dark:border-[#FCF6EC]/20 bg-white">
                  {vehicleType}
                </h3>
                <div className="p-4">
                {vehicleType === 'MRV811' ? (
                    <div className="space-y-4">
                      {/* Duty Officer Card */}
                      <div className="p-3 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-sm bg-white dark:bg-[#2E2521]/80 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase">
                            DUTY OFFICER
                          </span>
                        </div>
                        <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px]">
                          {vehicleAssignments.find(a => a.section === 'COMMAND' && a.position === 'Duty Officer')?.personnel_name || '-'}
                        </div>
                      </div>
                      
                      {/* Bridge Crew Section */}
                      <div className="p-3 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-sm bg-white dark:bg-[#2E2521]/80 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase">
                            BRIDGE CREW
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-4">
                          {['OOW', 'ENG/EMT', 'STEERSMAN', 'NAV SPEC'].map(position => (
                            <div key={position} className="space-y-2">
                              <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                {position}
                              </div>
                              <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px]">
                                {vehicleAssignments.find(a => a.section === 'BRIDGE' && a.position === position)?.personnel_name || '-'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {/* Section 1 */}
                      <div className="p-3 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-sm bg-white dark:bg-[#2E2521]/80 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase">
                            SECTION 1 (FIREFIGHTING CREW)
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-4">
                          {['SC', 'FF1', 'FF2', 'FF3'].map(position => (
                            <div key={position} className="space-y-2">
                              <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                {position}
                              </div>
                              <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px]">
                                {vehicleAssignments.find(a => a.section === 'SECTION 1' && a.position === position)?.personnel_name || '-'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {/* Section 2 */}
                      <div className="p-3 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-sm bg-white dark:bg-[#2E2521]/80 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase">
                            SECTION 2 (DECK CREW / MOORING PARTY)
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          {['FF1', 'FF2', 'FF3'].map(position => (
                            <div key={position} className="space-y-2">
                              <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                {position}
                              </div>
                              <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px]">
                                {vehicleAssignments.find(a => a.section === 'SECTION 2' && a.position === position)?.personnel_name || '-'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {/* Section 3 */}
                      <div className="p-3 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-sm bg-white dark:bg-[#2E2521]/80 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase">
                            SECTION 3 (RESCUE & EVACUATION TEAM)
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-4">
                          {['SC', 'FF1', 'FF2', 'FF3'].map(position => (
                            <div key={position} className="space-y-2">
                              <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                {position}
                              </div>
                              <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px]">
                                {vehicleAssignments.find(a => a.section === 'SECTION 3' && a.position === position)?.personnel_name || '-'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : vehicleType === 'LF811' || vehicleType === 'LF812' ? (
                    renderRegularVehicle(vehicleType, vehicleAssignments)
                  ) : vehicleType === 'RFV811' ? (
                    renderRFV811(vehicleAssignments)
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      <div className="p-3 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-sm bg-white dark:bg-[#2E2521]/80 shadow-sm">
                        <div className="grid grid-cols-4 gap-4">
                          {Array.from(new Set(vehicleAssignments.map(a => a.position))).map(position => (
                            <div key={position} className="space-y-2">
                              <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                {position}
                              </div>
                              <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px]">
                                {vehicleAssignments.find(a => a.position === position)?.personnel_name || '-'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </main>
        </div>
    </div>
  )
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 uppercase tracking-[0.2em]">{title}</p>
      <p className="text-2xl font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[-0.02em]">{value}</p>
    </div>
  );
}

