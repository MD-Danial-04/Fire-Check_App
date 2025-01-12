'use client'

import { createBrowserClient } from '@supabase/ssr'
import { useEffect, useState } from 'react'
import { Search, Plus, Calendar } from 'lucide-react'
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
import { Badge } from "@/components/ui/badge"

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

export default function ManningList() {
  const [dutyInfo, setDutyInfo] = useState<DutyInfo | null>(null);
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [assignments, setAssignments] = useState<{[key: string]: VehicleAssignment[]}>({});
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0])
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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
        async () => {
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
        async () => {
          const { data } = await supabase
            .from('daily_statistics')
            .select('*')
            .single();
          if (data) setStats(data);
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
        async () => {
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
      supabase.removeChannel(assignmentsChannel);
    };
  }, [supabase]);

  // Add type for the event handler
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDateFilter(e.target.value);
  };

  const renderRegularVehicle = (vehicleType: string, vehicleAssignments: VehicleAssignment[]) => {
    // Get unique positions while preserving order for all vehicles
    const positions = vehicleAssignments
      .reduce<{value: string, index: number}[]>((acc, curr, idx) => {
        if (!acc.find(p => p.value === curr.position)) {
          acc.push({ value: curr.position, index: idx + 1 });
        }
        return acc;
      }, [])
      .sort((a, b) => a.index - b.index)
      .map(p => ({
        label: `Position ${p.index}`,
        value: p.value
      }));

    return (
      <div className="border border-neutral-200 rounded-lg overflow-hidden">
        <div className="bg-neutral-100 px-4 py-2">
          <h3 className="text-sm font-bold text-neutral-900">{vehicleType}</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-white border-b border-neutral-200">
              {positions.map((pos) => (
                <TableHead key={pos.label} className="py-3 px-4 text-sm font-medium text-neutral-600">
                  {pos.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="hover:bg-neutral-50">
              {positions.map((pos) => {
                const assignment = vehicleAssignments.find(a => a.position === pos.value);
                return (
                  <TableCell key={pos.label} className="px-4 py-4">
                    <div className="text-sm font-medium text-neutral-600">{pos.value}</div>
                    <div className="mt-1 text-sm text-neutral-900">
                      {assignment?.personnel_name || '-'}
                    </div>
                  </TableCell>
                );
              })}
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderMRV811Sections = (assignments: VehicleAssignment[]) => {
    // Get all unique sections for MRV811
    const sections = Array.from(new Set(assignments.map(a => a.section))).map(sectionTitle => {
      const sectionAssignments = assignments.filter(a => a.section === sectionTitle);
      const positions = Array.from(new Set(sectionAssignments.map(a => a.position))).map(pos => ({
        label: "Position " + (sectionAssignments.findIndex(a => a.position === pos) + 1),
        value: pos
      }));

      return {
        title: sectionTitle,
        positions: positions
      };
    });

    return (
      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.title} className="rounded-lg overflow-hidden">
            <div className="bg-neutral-100 px-4 py-2">
              <h3 className="text-sm font-bold text-neutral-900">
                {section.title === "BRIDGE" ? "BRIDGE CREW" :
                 section.title === "SECTION 1" ? "SECTION 1 (FIREFIGHTING CREW)" :
                 section.title === "SECTION 2" ? "SECTION 2 (DECK CREW / MOORING PARTY)" :
                 "SECTION 3 (RESCUE & EVACUATION TEAM)"}
              </h3>
            </div>
            <div className="border border-neutral-200 border-t-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-white border-b border-neutral-200">
                    {section.positions.map((pos) => (
                      <TableHead key={pos.label} className="py-3 px-4 text-sm font-medium text-neutral-600">
                        {pos.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="hover:bg-neutral-50">
                    {section.positions.map((pos) => {
                      const assignment = assignments.find(a => 
                        a.section === section.title && 
                        a.position === pos.value
                      );
                      return (
                        <TableCell key={pos.label} className="px-4 py-4">
                          {pos.value && (
                            <>
                              <div className="text-sm font-medium text-neutral-600">{pos.value}</div>
                              <div className="mt-1 text-sm text-neutral-900">
                                {assignment?.personnel_name || '-'}
                              </div>
                            </>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="border-b border-neutral-100 bg-white">
        <div className="flex h-16 items-center gap-4 px-6">
          <h1 className="text-xl font-medium text-neutral-900 mr-8">Manning List</h1>
          
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input 
              type="search" 
              placeholder="Search personnel..." 
              className="pl-10 bg-neutral-50 border-0 w-full focus-visible:ring-neutral-900"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Date Picker */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-neutral-400" />
            <Input
              type="date"
              value={dateFilter}
              onChange={handleDateChange}
              className="bg-neutral-50 border-0 focus-visible:ring-neutral-900"
            />
          </div>

          <Button className="bg-neutral-900 hover:bg-neutral-800 ml-4">
            <Plus className="mr-2 h-4 w-4" /> Add Personnel
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Header Info */}
          <Card className="shadow-sm">
            <CardContent className="pt-6">
              <div className="grid gap-8 md:grid-cols-4">
                <div>
                  <h2 className="text-sm font-medium text-neutral-500 mb-2">Total Strength</h2>
                  <p className="text-2xl font-medium text-neutral-900">{stats?.total_strength || '0'}</p>
                </div>
                <div>
                  <h2 className="text-sm font-medium text-neutral-500 mb-2">Current Duty Ops</h2>
                  <p className="text-2xl font-medium text-neutral-900">{stats?.current_duty_ops || '0'}</p>
                </div>
                <div>
                  <h2 className="text-sm font-medium text-neutral-500 mb-2">On Leave</h2>
                  <p className="text-2xl font-medium text-neutral-900">{stats?.leave_count || '0'}</p>
                </div>
                <div>
                  <h2 className="text-sm font-medium text-neutral-500 mb-2">Course/MC</h2>
                  <p className="text-2xl font-medium text-neutral-900">{stats?.mc_count || '0'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Duty Info */}
          <Card className="shadow-sm">
            <CardContent className="pt-6">
              <div className="grid gap-8 md:grid-cols-2">
                <div>
                  <h2 className="text-sm font-medium text-neutral-500 mb-2">Duty Section Commander</h2>
                  <p className="text-[15px] font-medium">{dutyInfo?.duty_section_commander || '-'}</p>
                </div>
                <div>
                  <h2 className="text-sm font-medium text-neutral-500 mb-2">Duty Date</h2>
                  <p className="text-[15px] font-medium">
                    {dutyInfo?.date ? new Date(dutyInfo.date).toLocaleDateString('en-GB', {
                      weekday: 'long',
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    }) : '-'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Vehicle Assignments Section */}
          <div className="space-y-6">
            {Object.entries(assignments).map(([vehicleType, vehicleAssignments]) => (
              <div key={vehicleType}>
                {vehicleType === 'MRV811' ? (
                  renderMRV811Sections(vehicleAssignments)
                ) : (
                  renderRegularVehicle(vehicleType, vehicleAssignments)
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

function StatCard({ title, value }: { title: string; value?: string }) {
  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-sm font-medium text-neutral-600">{title}</p>
        <p className="text-2xl font-medium text-neutral-900 mt-2">{value || '0'}</p>
      </CardContent>
    </Card>
  )
}

