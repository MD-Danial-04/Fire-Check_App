'use client'

import { createBrowserClient } from '@supabase/ssr'
import { useEffect, useState } from 'react'
import { Search, Calendar } from 'lucide-react'
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface Personnel {
  serial_no: number;
  rank: string;
  name: string;
  role: string;
  status: string;
}

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

export default function DutySheet() {
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [dutyInfo, setDutyInfo] = useState<DutyInfo | null>(null);
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);

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

      // Fetch personnel data
      const { data: personnelData } = await supabase
        .from('personnel')
        .select('*')
        .order('serial_no');

      if (personnelData) {
        setPersonnel(personnelData);
      }
    }

    fetchData();
  }, [supabase]);

  // Group personnel by status
  const groupedPersonnel = personnel.reduce<{[key: string]: Personnel[]}>((acc, curr) => {
    const key = curr.status || 'ON DUTY';
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(curr);
    return acc;
  }, {});

  // Order of status groups
  const statusOrder = ['ON DUTY', 'LEAVE', 'MC', 'COURSE', 'LD', 'OFF', 'OA'];

  return (
    <div className="flex-1 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="border-b border-neutral-100 bg-white">
        <div className="flex h-16 items-center px-6">
          <h1 className="text-xl font-medium text-neutral-900">Duty Sheet</h1>
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

          {/* Filters */}
          <div className="flex gap-4 items-center">
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
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-neutral-400" />
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-neutral-50 border-0 focus-visible:ring-neutral-900"
              />
            </div>
          </div>

          {/* Personnel Groups */}
          <div className="space-y-6">
            {statusOrder.map(status => {
              const statusPersonnel = groupedPersonnel[status] || [];
              if (statusPersonnel.length === 0) return null;

              return (
                <Card key={status} className="shadow-sm">
                  <div className="bg-neutral-100 px-4 py-2 rounded-t-lg">
                    <h2 className="text-sm font-bold text-neutral-900">
                      {status} ({statusPersonnel.length})
                    </h2>
                  </div>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-24">S/N</TableHead>
                          <TableHead className="w-32">Rank</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead className="w-48">Role</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {statusPersonnel
                          .filter(person => 
                            person.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            person.rank.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            person.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            person.serial_no.toString().includes(searchTerm)
                          )
                          .map((person) => (
                            <TableRow key={person.serial_no} className="hover:bg-neutral-50">
                              <TableCell className="font-medium">{person.serial_no}</TableCell>
                              <TableCell>{person.rank}</TableCell>
                              <TableCell>{person.name}</TableCell>
                              <TableCell>{person.role}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
} 