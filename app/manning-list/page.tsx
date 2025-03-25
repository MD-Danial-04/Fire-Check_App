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
import { ResponsiveTable } from "@/components/ui/responsive-table"

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
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showMobileDate, setShowMobileDate] = useState(false);
  
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
      <div className="p-4 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-md bg-white dark:bg-[#2E2521]/80 shadow-sm">
        {/* Mobile View */}
        <div className="md:hidden space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                SC
              </span>
              <div className="flex flex-col">
                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                  {vehicleAssignments.find(a => a.position === 'SC')?.personnel_name?.split(' ')[0] || '-'}
                </span>
                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                  {vehicleAssignments.find(a => a.position === 'SC')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                PO
              </span>
              <div className="flex flex-col">
                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                  {vehicleAssignments.find(a => a.position === 'PO')?.personnel_name?.split(' ')[0] || '-'}
                </span>
                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                  {vehicleAssignments.find(a => a.position === 'PO')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                </span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                FF1
              </span>
              <div className="flex flex-col">
                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                  {vehicleAssignments.find(a => a.position === 'FF1')?.personnel_name?.split(' ')[0] || '-'}
                </span>
                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                  {vehicleAssignments.find(a => a.position === 'FF1')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                FF2
              </span>
              <div className="flex flex-col">
                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                  {vehicleAssignments.find(a => a.position === 'FF2')?.personnel_name?.split(' ')[0] || '-'}
                </span>
                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                  {vehicleAssignments.find(a => a.position === 'FF2')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                </span>
              </div>
            </div>
          </div>
        </div>
        {/* Desktop View */}
        <div className="hidden md:grid grid-cols-4 gap-6">
          {standardPositions.map(position => (
            <div key={position} className="space-y-4">
              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                {position}
              </span>
              <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em] block">
                {vehicleAssignments.find(a => a.position === position)?.personnel_name || '-'}
              </span>
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
      <div className="p-4 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-md bg-white dark:bg-[#2E2521]/80 shadow-sm">
        {/* Mobile View */}
        <div className="md:hidden space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                OOW
              </span>
              <div className="flex flex-col">
                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                  {vehicleAssignments.find(a => a.position === 'OOW')?.personnel_name?.split(' ')[0] || '-'}
                </span>
                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                  {vehicleAssignments.find(a => a.position === 'OOW')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                ENG/EMT
              </span>
              <div className="flex flex-col">
                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                  {vehicleAssignments.find(a => a.position === 'ENG/EMT')?.personnel_name?.split(' ')[0] || '-'}
                </span>
                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                  {vehicleAssignments.find(a => a.position === 'ENG/EMT')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                </span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                STEERSMAN
              </span>
              <div className="flex flex-col">
                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                  {vehicleAssignments.find(a => a.position === 'STEERSMAN')?.personnel_name?.split(' ')[0] || '-'}
                </span>
                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                  {vehicleAssignments.find(a => a.position === 'STEERSMAN')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                NAV
              </span>
              <div className="flex flex-col">
                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                  {vehicleAssignments.find(a => a.position === 'NAV')?.personnel_name?.split(' ')[0] || '-'}
                </span>
                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                  {vehicleAssignments.find(a => a.position === 'NAV')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                </span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                FF1
              </span>
              <div className="flex flex-col">
                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                  {vehicleAssignments.find(a => a.position === 'FF1')?.personnel_name?.split(' ')[0] || '-'}
                </span>
                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                  {vehicleAssignments.find(a => a.position === 'FF1')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                FF2
              </span>
              <div className="flex flex-col">
                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                  {vehicleAssignments.find(a => a.position === 'FF2')?.personnel_name?.split(' ')[0] || '-'}
                </span>
                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                  {vehicleAssignments.find(a => a.position === 'FF2')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                </span>
              </div>
            </div>
          </div>
        </div>
        {/* Desktop View - First Row */}
        <div className="hidden md:grid grid-cols-3 gap-6 mb-6">
          {firstRowPositions.map(position => (
            <div key={position} className="space-y-4">
              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                {position}
              </span>
              <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em] block">
                {vehicleAssignments.find(a => a.position === position)?.personnel_name || '-'}
              </span>
            </div>
          ))}
        </div>
        {/* Desktop View - Second Row */}
        <div className="hidden md:grid grid-cols-3 gap-6">
          {secondRowPositions.map(position => (
            <div key={position} className="space-y-4">
              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                {position}
              </span>
              <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em] block">
                {vehicleAssignments.find(a => a.position === position)?.personnel_name || '-'}
              </span>
            </div>
          ))}
                    </div>
      </div>
    );
  };

  const renderMRV811Sections = (assignments: VehicleAssignment[]) => {
    // Define the sections and their positions
    const sections: Record<MRVSection, SectionDefinition> = {
      'COMMAND': {
        title: 'COMMAND',
        displayTitle: 'COMMAND',
        positions: ['OIC', 'DCOM', 'WATCHKEEPER'],
        positionMap: {
          'OIC': 'OIC',
          'DCOM': 'DCOM',
          'WATCHKEEPER': 'WATCHKEEPER'
        }
      },
      'BRIDGE': {
        title: 'BRIDGE',
        displayTitle: 'BRIDGE',
        positions: ['HELMSMAN', 'NAV', 'COMMS'],
        positionMap: {
          'HELMSMAN': 'HELMSMAN',
          'NAV': 'NAV',
          'COMMS': 'COMMS'
        }
      },
      'FIREFIGHTING': {
        title: 'FIREFIGHTING',
        displayTitle: 'FIREFIGHTING',
        positions: ['TEAM LEADER', 'FF1', 'FF2', 'FF3', 'FF4'],
        positionMap: {
          'TEAM LEADER': 'TEAM LEADER',
          'FF1': 'FF1',
          'FF2': 'FF2',
          'FF3': 'FF3',
          'FF4': 'FF4'
        }
      },
      'DECK': {
        title: 'DECK',
        displayTitle: 'DECK',
        positions: ['DECK IC', 'PUMP OP', 'DECK HAND'],
        positionMap: {
          'DECK IC': 'DECK IC',
          'PUMP OP': 'PUMP OP',
          'DECK HAND': 'DECK HAND'
        }
      },
      'RESCUE': {
        title: 'RESCUE',
        displayTitle: 'RESCUE',
        positions: ['RESCUE IC', 'RESCUE 1', 'RESCUE 2'],
        positionMap: {
          'RESCUE IC': 'RESCUE IC',
          'RESCUE 1': 'RESCUE 1',
          'RESCUE 2': 'RESCUE 2'
        }
      }
    };

    return (
      <div className="space-y-6">
        {Object.entries(sections).map(([sectionKey, section]) => (
          <div key={sectionKey} className="p-3 border border-gray-200 dark:border-neutral-800 rounded-lg bg-white dark:bg-neutral-900 shadow-sm">
            <h3 className="text-sm font-medium mb-4">{section.displayTitle}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {section.positions.map(position => (
                <div key={position} className="space-y-2">
                  <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    {position}
            </div>
                  <div className="text-sm font-medium">
                    {assignments.find(a => 
                      a.section === sectionKey && 
                      a.position === (section.positionMap?.[position] || position)
                    )?.personnel_name || '-'}
                              </div>
            </div>
              ))}
            </div>
          </div>
        ))}
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
        <header className="px-4 md:px-6 pt-6 pb-4 md:pb-8 border-b border-gray-200 dark:border-[#FCF6EC]/20">
          {/* Mobile Header */}
          <div className="md:hidden space-y-4 max-w-7xl mx-auto">
            <div className="flex flex-col items-start">
              <span className="text-[8px] tracking-[0.2em] text-neutral-500 uppercase mb-1">
                PERSONNEL DUTY ROSTER
              </span>
              <h1 className="text-2xl tracking-tight text-neutral-900 dark:text-[#FCF6EC] uppercase">
                MANNING LIST
              </h1>
            </div>
          </div>

          {/* Desktop Header */}
          <div className="hidden md:flex items-center justify-between mb-12 max-w-7xl mx-auto">
            <div className="space-y-0.5">
              <span className="text-[10px] tracking-[0.2em] text-gray-500 uppercase block">Fire Check</span>
              <h1 className="text-[32px] font-normal tracking-[-0.02em] text-gray-900 dark:text-[#FCF6EC] uppercase">Manning List</h1>
            </div>
            <span className="text-[10px] tracking-[0.2em] text-gray-500 dark:text-[#FCF6EC]/60 uppercase">Personnel Duty Roster</span>
          </div>
          
          {/* Stats Overview */}
          <div className="flex flex-row justify-between mt-8 max-w-7xl mx-auto px-2">
            <div className="flex flex-col items-start">
              <p className="text-[10px] font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 uppercase tracking-[0.2em]">TOTAL</p>
              <p className="text-[24px] md:text-[32px] font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[-0.02em]">{stats?.total_strength || '0'}</p>
            </div>
            
            <div className="flex flex-col items-start">
              <p className="text-[10px] font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 uppercase tracking-[0.2em]">
                <span className="md:hidden">DUTY OPS</span>
                <span className="hidden md:inline">CURRENT<br />DUTY OPS</span>
              </p>
              <p className="text-[24px] md:text-[32px] font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[-0.02em] md:ml-8">{stats?.current_duty_ops || '0'}</p>
            </div>
            
            <div className="flex flex-col items-start">
              <p className="text-[10px] font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 uppercase tracking-[0.2em]">LEAVE</p>
              <p className="text-[24px] md:text-[32px] font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[-0.02em]">{stats?.leave_count || '0'}</p>
            </div>
            
            <div className="flex flex-col items-start">
              <p className="text-[10px] font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 uppercase tracking-[0.2em]">MC</p>
              <p className="text-[24px] md:text-[32px] font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[-0.02em]">{stats?.mc_count || '0'}</p>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="px-6 pb-6">
          {/* Search and Actions */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-6 py-4 md:py-6 max-w-7xl mx-auto">
            {/* Mobile Actions */}
            <div className="flex md:hidden items-center justify-between w-full gap-2">
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => setShowMobileSearch(!showMobileSearch)}
                className="h-8 w-8 shrink-0"
              >
                <Search className="h-4 w-4" />
              </Button>

              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => setShowMobileDate(!showMobileDate)}
                  className="h-8 w-8"
                >
                  <Calendar className="h-4 w-4" />
                </Button>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="icon"
                      className="h-8 w-8"
                    >
                      <Users className="h-4 w-4" />
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
                      size="icon"
                      className="h-8 w-8"
                    >
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        width="16" 
                        height="16" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        className="h-4 w-4"
                      >
                        <line x1="18" y1="20" x2="18" y2="10"></line>
                        <line x1="12" y1="20" x2="12" y2="4"></line>
                        <line x1="6" y1="20" x2="6" y2="14"></line>
                      </svg>
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
                  size="icon"
                  className="h-8 w-8 bg-neutral-900"
                >
                  <Plus className="h-4 w-4 text-white" />
                </Button>
              </div>
            </div>

            {/* Mobile Search - Expandable */}
            {showMobileSearch && (
              <div className="md:hidden w-full">
                <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input 
              type="search" 
              placeholder="Search personnel..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-neutral-50 dark:bg-[#1C1917] border-0 w-full focus-visible:ring-neutral-900 h-9"
            />
          </div>
              </div>
            )}

            {/* Mobile Date - Expandable */}
            {showMobileDate && (
              <div className="md:hidden w-full">
            <Input
              type="date"
              value={dateFilter}
              onChange={handleDateChange}
                  className="w-full bg-neutral-50 dark:bg-[#1C1917] border-0 focus-visible:ring-neutral-900 text-xs font-['Azeret_Mono'] h-9"
                />
              </div>
            )}

            {/* Desktop Search and Actions */}
            <div className="hidden md:block relative w-[480px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input 
                type="search" 
                placeholder="Search personnel..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-neutral-50 dark:bg-[#1C1917] border-0 w-full focus-visible:ring-neutral-900 h-9"
              />
            </div>

            <div className="hidden md:flex items-center gap-4">
              <div className="flex items-center bg-neutral-50 dark:bg-[#1C1917] rounded-md h-9 px-3">
                <Calendar className="h-4 w-4 mr-2 text-neutral-500" />
                <Input
                  type="date"
                  value={dateFilter}
                  onChange={handleDateChange}
                  className="w-[120px] bg-transparent border-0 focus-visible:ring-0 text-xs font-['Azeret_Mono'] h-9 p-0"
            />
          </div>

              <Dialog>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline"
                    className="h-9 px-3 rounded-md transition-colors text-xs tracking-wide border border-gray-200 dark:border-[#FCF6EC]/20 flex items-center gap-1"
                  >
                    <Users className="h-3.5 w-3.5 mr-1" />
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
                    className="h-9 px-3 rounded-md transition-colors text-xs tracking-wide border border-gray-200 dark:border-[#FCF6EC]/20 flex items-center gap-1"
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
                      className="mr-1"
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
                className="bg-neutral-900 hover:bg-neutral-800 h-9 px-3 rounded-md"
              >
                <Plus className="h-4 w-4 mr-2" /> Add Personnel
          </Button>
                </div>
              </div>
          
          {/* Border separator */}
          <div className="border-b border-gray-200 dark:border-[#FCF6EC]/20"></div>
          
          {/* Duty Info Card */}
          <div className="max-w-7xl mx-auto mb-8">
            <Card className="shadow-sm border border-gray-200 dark:border-[#FCF6EC]/20 bg-white dark:bg-[#2E2521]">
              <CardContent className="pt-6 pb-4">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <h2 className="text-sm font-normal text-gray-500 dark:text-[#FCF6EC]/60 mb-2">
                      Duty Section Commander
                    </h2>
                    <p className="text-sm font-normal text-gray-900 dark:text-[#FCF6EC]">
                      {dutyInfo?.duty_section_commander || '-'}
                    </p>
                </div>
                  <div className="space-y-2">
                    <h2 className="text-sm font-normal text-gray-500 dark:text-[#FCF6EC]/60 mb-2">
                      Duty Date
                    </h2>
                    <p className="text-sm font-normal text-gray-900 dark:text-[#FCF6EC]">
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

          {/* Vehicle Assignments */}
          <div className="space-y-6 max-w-7xl mx-auto">
            {Object.entries(assignments).map(([vehicleType, vehicleAssignments]) => (
              <div key={vehicleType} className="bg-gray-200 dark:bg-[#2E2521] rounded-md overflow-hidden border border-gray-200 dark:border-[#FCF6EC]/20 shadow-sm">
                <h3 className="text-sm tracking-[0.2em] uppercase font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] px-6 py-4 border-b border-gray-200 dark:border-[#FCF6EC]/20 bg-white dark:bg-[#2E2521]">
                  {vehicleType}
                </h3>
                <div className="p-4">
                {vehicleType === 'MRV811' ? (
                    <div className="space-y-4">
                      {/* Duty Officer Card */}
                      <div className="p-4 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-md bg-white dark:bg-[#2E2521]/80 shadow-sm">
                        <div className="space-y-4">
                          <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                            DUTY OFFICER
                          </span>
                          <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em] block">
                            {vehicleAssignments.find(a => a.section === 'COMMAND' && a.position === 'Duty Officer')?.personnel_name || '-'}
                          </span>
                        </div>
                      </div>

                      {/* Bridge Crew Cards */}
                      <div className="p-4 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-md bg-white dark:bg-[#2E2521]/80 shadow-sm">
                        <div className="flex items-center justify-between mb-5">
                          <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase font-medium">
                            BRIDGE CREW
                          </span>
                        </div>
                        {/* Mobile View */}
                        <div className="md:hidden space-y-6">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                                OOW
                              </span>
                              <div className="flex flex-col">
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'BRIDGE' && a.position === 'OOW')?.personnel_name?.split(' ')[0] || '-'}
                                </span>
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'BRIDGE' && a.position === 'OOW')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                                </span>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                                ENG/EMT
                              </span>
                              <div className="flex flex-col">
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'BRIDGE' && a.position === 'ENG/EMT')?.personnel_name?.split(' ')[0] || '-'}
                                </span>
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'BRIDGE' && a.position === 'ENG/EMT')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                                HELMSMAN
                              </span>
                              <div className="flex flex-col">
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'BRIDGE' && a.position === 'HELMSMAN')?.personnel_name?.split(' ')[0] || '-'}
                                </span>
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'BRIDGE' && a.position === 'HELMSMAN')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                                </span>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                                NAV SPEC
                              </span>
                              <div className="flex flex-col">
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'BRIDGE' && a.position === 'NAV SPEC')?.personnel_name?.split(' ')[0] || '-'}
                                </span>
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'BRIDGE' && a.position === 'NAV SPEC')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        {/* Desktop View */}
                        <div className="hidden md:grid grid-cols-4 gap-6">
                          {['OOW', 'ENG/EMT', 'HELMSMAN', 'NAV SPEC'].map(position => (
                            <div key={position} className="space-y-4">
                              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                                {position}
                              </span>
                              <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em] block">
                                {vehicleAssignments.find(a => a.section === 'BRIDGE' && a.position === position)?.personnel_name || '-'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Section 1 Cards */}
                      <div className="p-4 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-md bg-white dark:bg-[#2E2521]/80 shadow-sm">
                        <div className="flex items-center justify-between mb-5">
                          <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase font-medium">
                            SECTION 1 (FIREFIGHTING CREW)
                          </span>
                        </div>
                        {/* Mobile View */}
                        <div className="md:hidden space-y-6">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                                SC
                              </span>
                              <div className="flex flex-col">
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'SECTION 1' && a.position === 'SC')?.personnel_name?.split(' ')[0] || '-'}
                                </span>
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'SECTION 1' && a.position === 'SC')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                                </span>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                                FF1
                              </span>
                              <div className="flex flex-col">
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'SECTION 1' && a.position === 'FF1')?.personnel_name?.split(' ')[0] || '-'}
                                </span>
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'SECTION 1' && a.position === 'FF1')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                                FF2
                              </span>
                              <div className="flex flex-col">
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'SECTION 1' && a.position === 'FF2')?.personnel_name?.split(' ')[0] || '-'}
                                </span>
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'SECTION 1' && a.position === 'FF2')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                                </span>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                                FF3
                              </span>
                              <div className="flex flex-col">
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'SECTION 1' && a.position === 'FF3')?.personnel_name?.split(' ')[0] || '-'}
                                </span>
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'SECTION 1' && a.position === 'FF3')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        {/* Desktop View */}
                        <div className="hidden md:grid grid-cols-4 gap-6">
                          {['SC', 'FF1', 'FF2', 'FF3'].map(position => (
                            <div key={position} className="space-y-4">
                              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                                {position}
                              </span>
                              <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em] block">
                                {vehicleAssignments.find(a => a.section === 'SECTION 1' && a.position === position)?.personnel_name || '-'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Section 2 Cards */}
                      <div className="p-4 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-md bg-white dark:bg-[#2E2521]/80 shadow-sm">
                        <div className="flex items-center justify-between mb-5">
                          <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase font-medium">
                            SECTION 2 (DECK CREW / MOORING PARTY)
                          </span>
                        </div>
                        {/* Mobile View */}
                        <div className="md:hidden space-y-6">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                                SC
                              </span>
                              <div className="flex flex-col">
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'SECTION 2' && a.position === 'SC')?.personnel_name?.split(' ')[0] || '-'}
                                </span>
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'SECTION 2' && a.position === 'SC')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                                </span>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                                FF1
                              </span>
                              <div className="flex flex-col">
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'SECTION 2' && a.position === 'FF1')?.personnel_name?.split(' ')[0] || '-'}
                                </span>
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'SECTION 2' && a.position === 'FF1')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                                FF2
                              </span>
                              <div className="flex flex-col">
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'SECTION 2' && a.position === 'FF2')?.personnel_name?.split(' ')[0] || '-'}
                                </span>
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'SECTION 2' && a.position === 'FF2')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                                </span>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                                FF3
                              </span>
                              <div className="flex flex-col">
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'SECTION 2' && a.position === 'FF3')?.personnel_name?.split(' ')[0] || '-'}
                                </span>
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'SECTION 2' && a.position === 'FF3')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        {/* Desktop View */}
                        <div className="hidden md:grid grid-cols-4 gap-6">
                          {['SC', 'FF1', 'FF2', 'FF3'].map(position => (
                            <div key={position} className="space-y-4">
                              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                                {position}
                              </span>
                              <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em] block">
                                {vehicleAssignments.find(a => a.section === 'SECTION 2' && a.position === position)?.personnel_name || '-'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Section 3 Cards */}
                      <div className="p-4 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-md bg-white dark:bg-[#2E2521]/80 shadow-sm">
                        <div className="flex items-center justify-between mb-5">
                          <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase font-medium">
                            SECTION 3 (RESCUE & EVACUATION TEAM)
                          </span>
                        </div>
                        {/* Mobile View */}
                        <div className="md:hidden space-y-6">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                                SC
                              </span>
                              <div className="flex flex-col">
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'SECTION 3' && a.position === 'SC')?.personnel_name?.split(' ')[0] || '-'}
                                </span>
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'SECTION 3' && a.position === 'SC')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                              </span>
                            </div>
                        </div>
                            <div className="space-y-2">
                              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                                FF1
                              </span>
                              <div className="flex flex-col">
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'SECTION 3' && a.position === 'FF1')?.personnel_name?.split(' ')[0] || '-'}
                                </span>
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'SECTION 3' && a.position === 'FF1')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                              </span>
                            </div>
                        </div>
                      </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                                FF2
                              </span>
                              <div className="flex flex-col">
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'SECTION 3' && a.position === 'FF2')?.personnel_name?.split(' ')[0] || '-'}
                                </span>
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'SECTION 3' && a.position === 'FF2')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                                </span>
                    </div>
                            </div>
                            <div className="space-y-2">
                              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                                FF3
                              </span>
                              <div className="flex flex-col">
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'SECTION 3' && a.position === 'FF3')?.personnel_name?.split(' ')[0] || '-'}
                                </span>
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em]">
                                  {vehicleAssignments.find(a => a.section === 'SECTION 3' && a.position === 'FF3')?.personnel_name?.split(' ').slice(1).join(' ') || ''}
                              </span>
                            </div>
                        </div>
                          </div>
                        </div>
                        {/* Desktop View */}
                        <div className="hidden md:grid grid-cols-4 gap-6">
                          {['SC', 'FF1', 'FF2', 'FF3'].map(position => (
                            <div key={position} className="space-y-4">
                              <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 text-xs tracking-[0.1em] uppercase block font-medium">
                                {position}
                              </span>
                              <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em] block">
                                {vehicleAssignments.find(a => a.section === 'SECTION 3' && a.position === position)?.personnel_name || '-'}
                              </span>
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
                    <div className="space-y-4">
                      <div className="p-4 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-md bg-white dark:bg-[#2E2521]/80 shadow-sm">
                        <div className="flex items-center justify-between mb-5">
                          <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase font-medium">
                            CREW ASSIGNMENTS
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-6">
                          {Array.from(new Set(vehicleAssignments.map(a => a.position))).map(position => (
                            <div key={position} className="space-y-4">
                              <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em] uppercase block font-medium">
                                {position}
                              </span>
                              <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.1em] block">
                                {vehicleAssignments.find(a => a.position === position)?.personnel_name || '-'}
                              </span>
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
      <p className="text-[10px] font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 uppercase tracking-[0.2em]">{title}</p>
      <p className="text-[32px] font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[-0.02em]">{value}</p>
    </div>
  );
}

