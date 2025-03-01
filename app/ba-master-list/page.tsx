'use client'

import { useState, useEffect } from 'react'
import { Search, MapPin, Plus, Check, X, List, Grid, Filter, AlertCircle } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getBAMasterList } from '@/lib/queries'
import type { BaMasterList } from '@/types/database'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { supabase } from '@/lib/supabase'
import { Sheet, SheetContent, SheetTrigger } from "@/app/components/ui/sheet"
import { cn } from "@/lib/utils"

const locations = [
  'All Locations',
  'MRV811',
  'RFV811',
  'LF811',
  'LF812',
  'Others',
  'SPARE'
]

// Helper function to get base location
const getBaseLocation = (location: string | null): string => {
  if (!location) return 'Unassigned'
  
  const baseLocations = ['LF811', 'LF812', 'MRV811', 'RFV811']
  for (const base of baseLocations) {
    if (location.toUpperCase().includes(base)) {
      return base
    }
  }
  return location === 'SPARE' ? 'SPARE' : 'Others'
}

// Helper function to extract role from location
const getRole = (location: string | null): string => {
  if (!location) return '-';
  
  // Check for FF1 or FF2 first
  if (location.toUpperCase().includes('FF1')) return 'FF1';
  if (location.toUpperCase().includes('FF2')) return 'FF2';
  
  // Check for SC and PO
  if (location.toUpperCase().includes(' SC') || location.toUpperCase().includes('- SC')) return 'SC';
  if (location.toUpperCase().includes(' PO') || location.toUpperCase().includes('- PO')) return 'PO';
  
  // Check for Set numbers
  const setMatch = location.match(/SET (\d+)/i);
  if (setMatch) return `Set ${setMatch[1]}`;
  
  return '-';
}

// Add this new function for role ordering
const getRoleOrder = (role: string): number => {
  const roleOrder: Record<string, number> = {
    'SC': 1,
    'PO': 2,
    'FF1': 3,
    'FF2': 4
  };
  
  // For Set numbers, order them by their number
  if (role.startsWith('Set ')) {
    const setNumber = parseInt(role.replace('Set ', ''), 10);
    return 10 + setNumber; // Start Set numbers after the main roles
  }
  
  return roleOrder[role] || 999; // Default to high number for unknown roles
}

export default function BAMasterList() {
  const [searchTerm, setSearchTerm] = useState('')
  const [locationFilter, setLocationFilter] = useState('All Locations')
  const [backplates, setBackplates] = useState<BaMasterList[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [view, setView] = useState<'list' | 'grouped'>('grouped')
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  // Calculate stats from backplates
  const stats = {
    total: backplates.length,
    inService: backplates.filter(b => !b.is_spare).length,
    dueService: backplates.filter(b => {
      if (!b.service_due_date) return false;
      
      const now = new Date();
      const dueDate = new Date(b.service_due_date);
      
      return dueDate.getMonth() === now.getMonth() && 
             dueDate.getFullYear() === now.getFullYear();
    }).length,
    spare: backplates.filter(b => b.is_spare).length
  }

  // Helper function to check if service is due this month
  const isServiceDueThisMonth = (dueDate: string | null): boolean => {
    if (!dueDate) return false;
    
    const now = new Date();
    const serviceDate = new Date(dueDate);
    
    return serviceDate.getMonth() === now.getMonth() && 
           serviceDate.getFullYear() === now.getFullYear();
  }

  useEffect(() => {
    fetchBAMasterList()

    // Set up real-time subscription
    const channel = supabase
      .channel('ba_master_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ba_master_list'
        },
        () => fetchBAMasterList()
      )
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, [])

  const fetchBAMasterList = async () => {
    try {
      setIsLoading(true)
      const data = await getBAMasterList()
      setBackplates(data)
    } catch (error) {
      console.error('Error fetching BA master list:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Update the filtering logic to include sorting by role
  const filteredBackplates = backplates.filter(backplate => {
    const matchesSearch = searchTerm === '' || 
      backplate.serial_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (backplate.cylinder_serial && backplate.cylinder_serial.toLowerCase().includes(searchTerm.toLowerCase()))
    
    const baseLocation = getBaseLocation(backplate.location);
    const matchesLocation = locationFilter === 'All Locations' || 
      baseLocation === locationFilter;

    return matchesSearch && matchesLocation
  }).sort((a, b) => {
    // First sort by base location
    const baseLocationA = getBaseLocation(a.location);
    const baseLocationB = getBaseLocation(b.location);
    
    if (baseLocationA !== baseLocationB) {
      // Use the locationOrder array for consistent location sorting
      const locationOrder = ['LF811', 'LF812', 'MRV811', 'RFV811', 'SPARE', 'Others', 'Unassigned'];
      return locationOrder.indexOf(baseLocationA) - locationOrder.indexOf(baseLocationB);
    }
    
    // Then sort by set number for MRV811 and RFV811
    if (baseLocationA === 'MRV811' || baseLocationA === 'RFV811') {
      const setNumberA = parseInt(a.location?.match(/Set (\d+)/)?.[1] || '0');
      const setNumberB = parseInt(b.location?.match(/Set (\d+)/)?.[1] || '0');
      return setNumberA - setNumberB;
    }
    
    // Then sort by role within the same location
    const roleA = getRole(a.location);
    const roleB = getRole(b.location);
    return getRoleOrder(roleA) - getRoleOrder(roleB);
  });

  // Group backplates by base location
  const groupedBackplates = filteredBackplates.reduce((acc, backplate) => {
    const baseLocation = getBaseLocation(backplate.location);
    if (!acc[baseLocation]) {
      acc[baseLocation] = [];
    }
    acc[baseLocation].push(backplate);
    return acc;
  }, {} as Record<string, BaMasterList[]>);

  // Sort each group by role
  Object.keys(groupedBackplates).forEach(location => {
    groupedBackplates[location].sort((a, b) => {
      const roleA = getRole(a.location);
      const roleB = getRole(b.location);
      return getRoleOrder(roleA) - getRoleOrder(roleB);
    });
  });

  // Sort order for locations
  const locationOrder = ['LF811', 'LF812', 'MRV811', 'RFV811', 'SPARE', 'Others', 'Unassigned'];
  const sortedLocations = Object.entries(groupedBackplates).sort((a, b) => {
    return locationOrder.indexOf(a[0]) - locationOrder.indexOf(b[0]);
  });

  const StationCard = ({ title, items }: { title: string, items: BaMasterList[] }) => (
    <div className="bg-white dark:bg-[#2E2521] rounded-lg shadow-md">
      <h3 className="text-xs tracking-[0.2em] uppercase font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] px-4 py-3 border-b border-gray-200 dark:border-[#FCF6EC]/20">
        {title}
      </h3>
      <div className="space-y-4 px-4 py-4">
        {items?.map((backplate) => (
          <div 
            key={backplate.id}
            className="space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase">
                {getRole(backplate.location)}
              </span>
              {!backplate.is_spare ? (
                <div className="bg-gray-100 dark:bg-[#FCF6EC]/10 rounded-full p-1">
                  <Check className="h-3 w-3 text-gray-900 dark:text-[#FCF6EC]" />
                </div>
              ) : (
                <div className="bg-gray-100 dark:bg-[#FCF6EC]/10 rounded-full p-1 opacity-40">
                  <X className="h-3 w-3 text-gray-900 dark:text-[#FCF6EC]" />
                </div>
              )}
            </div>
            <div className="space-y-2 border-b border-gray-200 dark:border-[#FCF6EC]/20 pb-4">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em]">Backplate</span>
                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px] text-right">
                  {backplate.serial_number}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em]">Cylinder</span>
                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px] text-right">
                  {backplate.cylinder_serial || '-'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Renamed from TableRow to BackplateTableRow
  const BackplateTableRow = ({ backplate, index }: { backplate: BaMasterList, index: number }) => (
    <TableRow 
      className={`
        bg-white hover:bg-gray-50 dark:hover:bg-[#FCF6EC]/5
        ${backplate.location === 'SPARE' ? 'bg-gray-50 dark:bg-[#FCF6EC]/5' : ''}
        ${isServiceDueThisMonth(backplate.service_due_date) ? 'bg-amber-50 dark:bg-amber-900/30' : ''}
      `}
    >
      <TableCell className="text-sm text-gray-700 dark:text-[#FCF6EC]/60 font-light font-['Azeret_Mono']">{index + 1}</TableCell>
      <TableCell className="text-sm text-gray-700 dark:text-[#FCF6EC]/60 font-light font-['Azeret_Mono']">
        {backplate.serial_number}
      </TableCell>
      <TableCell className="text-sm text-gray-700 dark:text-[#FCF6EC]/60 font-light font-['Azeret_Mono']">
        {backplate.cylinder_serial || '-'}
      </TableCell>
      <TableCell className="text-sm text-gray-700 dark:text-[#FCF6EC]/60 font-light font-['Azeret_Mono']">
        {backplate.date_of_birth ? new Date(backplate.date_of_birth).toLocaleDateString('en-GB', { 
          year: 'numeric', 
          month: 'short'
        }) : '-'}
      </TableCell>
      <TableCell className="text-sm text-gray-700 dark:text-[#FCF6EC]/60 font-light font-['Azeret_Mono']">
        {backplate.hydro_date ? new Date(backplate.hydro_date).toLocaleDateString('en-GB', {
          year: '2-digit',
          month: 'short'
        }) : '-'}
      </TableCell>
      <TableCell 
        className={`text-sm ${isServiceDueThisMonth(backplate.service_due_date) ? 'text-amber-600 font-medium' : 'text-gray-700 dark:text-[#FCF6EC]/60'} font-light font-['Azeret_Mono']`}
      >
        {backplate.service_due_date ? new Date(backplate.service_due_date).toLocaleDateString('en-GB', {
          year: '2-digit',
          month: 'short'
        }) : '-'}
      </TableCell>
      <TableCell className="text-sm text-gray-700 dark:text-[#FCF6EC]/60 font-light font-['Azeret_Mono']">
        {backplate.location || '-'}
      </TableCell>
      <TableCell className="text-center">
        {!backplate.is_spare ? (
          <div className="bg-gray-100 rounded-full p-1.5 mx-auto w-fit">
            <Check className="h-4 w-4 text-gray-900" />
          </div>
        ) : (
          <div className="bg-gray-100 rounded-full p-1.5 mx-auto w-fit opacity-40">
            <X className="h-4 w-4 text-gray-900" />
          </div>
        )}
      </TableCell>
    </TableRow>
  );

  // Update the usage in the table view
  const tableView = (
    <Table>
      <TableHeader>
        <TableRow className="bg-gray-200 dark:bg-[#2E2521]">
          <TableHead className="w-[60px] text-sm font-medium text-gray-900 dark:text-[#FCF6EC]/70 font-['Azeret_Mono']">S/N</TableHead>
          <TableHead className="w-[160px] text-sm font-medium text-gray-900 dark:text-[#FCF6EC]/70 font-['Azeret_Mono']">Serial Number</TableHead>
          <TableHead className="w-[160px] text-sm font-medium text-gray-900 dark:text-[#FCF6EC]/70 font-['Azeret_Mono']">Cylinder S/R No.</TableHead>
          <TableHead className="w-[100px] text-sm font-medium text-gray-900 dark:text-[#FCF6EC]/70 font-['Azeret_Mono']">DOB</TableHead>
          <TableHead className="w-[110px] text-sm font-medium text-gray-900 dark:text-[#FCF6EC]/70 font-['Azeret_Mono']">Hydrostatic</TableHead>
          <TableHead className="w-[110px] text-sm font-medium text-gray-900 dark:text-[#FCF6EC]/70 font-['Azeret_Mono']">Service Due</TableHead>
          <TableHead className="w-[140px] text-sm font-medium text-gray-900 dark:text-[#FCF6EC]/70 font-['Azeret_Mono']">Location</TableHead>
          <TableHead className="w-[80px] text-center text-sm font-medium text-gray-900 dark:text-[#FCF6EC]/70 font-['Azeret_Mono']">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filteredBackplates.map((backplate, index) => (
          <BackplateTableRow 
            key={backplate.id}
            backplate={backplate}
            index={index}
          />
        ))}
      </TableBody>
    </Table>
  );

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">Loading...</div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-white dark:bg-[#1C1917] font-['Azeret_Mono']">
      {/* Decorative Elements */}
      <div className="fixed top-6 left-6 w-1.5 h-1.5 rounded-full bg-gray-900 dark:bg-[#FCF6EC]" />
      <div className="fixed top-6 right-6 w-1.5 h-1.5 rounded-full bg-gray-900 dark:bg-[#FCF6EC]" />

      <div className="max-w-[1920px] mx-auto relative">
        {/* Header */}
        <header className="px-6 pt-6 pb-8 border-b border-gray-200 dark:border-[#FCF6EC]/20">
          <div className="flex items-center justify-between mb-12 max-w-7xl mx-auto">
            <div className="space-y-0.5">
              <span className="text-[10px] tracking-[0.2em] text-gray-500 uppercase block">Fire Check</span>
              <h1 className="text-[32px] font-normal tracking-[-0.02em] text-gray-900 dark:text-[#FCF6EC] uppercase">BA MASTER LIST</h1>
            </div>
            <span className="text-[10px] tracking-[0.2em] text-gray-500 dark:text-[#FCF6EC]/60 uppercase">SCBA Inventory</span>
          </div>
          
          {/* Stats Overview */}
          <div className="grid grid-cols-4 gap-24 max-w-7xl mx-auto">
            <StatCard title="Total Cylinders" value={stats.total} />
            <StatCard title="In Service" value={stats.inService} />
            <StatCard title="Due Service" value={stats.dueService} />
            <StatCard title="Spare" value={stats.spare} />
        </div>
      </header>

      {/* Main Content */}
        <main className="px-6 pb-6">
          {/* Search and Actions */}
          <div className="flex items-center justify-between gap-6 py-6 max-w-7xl mx-auto">
            <div className="relative w-[480px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <Input 
                  type="search" 
                  placeholder="Search by serial number..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-neutral-50 dark:bg-[#1C1917] border-0 w-full focus-visible:ring-neutral-900 h-9"
                />
              </div>

            <div className="flex items-center gap-4">
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="w-[200px] bg-neutral-50 dark:bg-[#1C1917] border-0 h-9 
                                      text-gray-900 dark:text-[#FCF6EC] text-xs font-['Azeret_Mono']
                                      focus-visible:ring-neutral-900 rounded-md">
                  <MapPin className="mr-2 h-4 w-4 text-neutral-400" />
                  <SelectValue placeholder="All Locations" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-[#2E2521] border-gray-200 dark:border-[#FCF6EC]/20">
                  {locations.map(location => (
                    <SelectItem 
                      key={location} 
                      value={location} 
                      className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] hover:bg-gray-100 dark:hover:bg-[#2E2521]/90 transition-colors text-xs tracking-wide"
                    >
                      {location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex bg-neutral-50 dark:bg-[#1C1917] rounded-md overflow-hidden">
              <Button
                  variant="ghost"
                size="sm"
                onClick={() => setView('list')}
                  className={cn(
                    "h-9 w-9 rounded-none transition-colors",
                    view === 'list' 
                      ? "bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-[#2E2521] dark:hover:bg-gray-50 font-medium" 
                      : "bg-neutral-50 text-neutral-500 hover:bg-neutral-100 dark:bg-[#1C1917] dark:text-[#FCF6EC]/70 dark:hover:bg-[#2E2521]/30"
                  )}
              >
                  <List className="h-4 w-4" />
              </Button>
              <Button
                  variant="ghost"
                size="sm"
                onClick={() => setView('grouped')}
                  className={cn(
                    "h-9 w-9 rounded-none transition-colors",
                    view === 'grouped' 
                      ? "bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-[#2E2521] dark:hover:bg-gray-50 font-medium" 
                      : "bg-neutral-50 text-neutral-500 hover:bg-neutral-100 dark:bg-[#1C1917] dark:text-[#FCF6EC]/70 dark:hover:bg-[#2E2521]/30"
                  )}
              >
                  <Grid className="h-4 w-4" />
              </Button>
              </div>

              <Button 
                className="bg-neutral-900 hover:bg-neutral-800 dark:bg-[#2E2521] dark:hover:bg-[#2E2521]/80 font-['Azeret_Mono'] h-9 px-3 rounded-md transition-colors text-xs tracking-wide border border-gray-200 dark:border-[#FCF6EC]/20 flex items-center gap-1"
              >
                <Plus className="h-4 w-4 text-white dark:text-[#FCF6EC]" /> 
                <span className="text-white dark:text-[#FCF6EC]">Add Cylinder</span>
              </Button>
            </div>
          </div>

          {/* Border separator */}
          <div className="border-b border-gray-200 dark:border-[#FCF6EC]/20"></div>

          {/* Content */}
          <div className="py-6 max-w-7xl mx-auto">
            {view === 'grouped' ? (
              <div className="space-y-6">
                {locationFilter === 'All Locations' ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-3 gap-6">
                      {/* LF811 */}
                      <div className="bg-gray-200 dark:bg-[#2E2521] rounded-md overflow-hidden min-h-[480px] border border-gray-200 dark:border-[#FCF6EC]/20">
                        <h3 className="text-xs tracking-[0.2em] uppercase font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] px-4 py-3 border-b border-gray-200 dark:border-[#FCF6EC]/20 bg-white">
                          LF811
                        </h3>
                        <div className="p-4 space-y-4">
                          {['SC', 'PO', 'FF1', 'FF2'].map((role) => (
                            <div key={role} className="p-3 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-sm bg-white dark:bg-[#2E2521]/80 shadow-sm">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase">
                                  {role}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-y-2">
                                <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                  Backplate
                                </div>
                                <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px] text-right">
                                  {(groupedBackplates['LF811'] || []).find(b => b.location?.includes(role))?.serial_number || '-'}
                                </div>
                                <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                  Cylinder
                                </div>
                                <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px] text-right">
                                  {(groupedBackplates['LF811'] || []).find(b => b.location?.includes(role))?.cylinder_serial || '-'}
                                </div>
                              </div>
                              {isServiceDueThisMonth((groupedBackplates['LF811'] || []).find(b => b.location?.includes(role))?.service_due_date ?? null) && (
                                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs mt-2">
                                  <AlertCircle className="h-3 w-3" />
                                  <span>Service Due</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* LF812 */}
                      <div className="bg-gray-200 dark:bg-[#2E2521] rounded-md overflow-hidden min-h-[480px] border border-gray-200 dark:border-[#FCF6EC]/20">
                        <h3 className="text-xs tracking-[0.2em] uppercase font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] px-4 py-3 border-b border-gray-200 dark:border-[#FCF6EC]/20 bg-white">
                          LF812
                        </h3>
                        <div className="p-4 space-y-4">
                          {['SC', 'PO', 'FF1', 'FF2'].map((role) => (
                            <div key={role} className="p-3 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-sm bg-white dark:bg-[#2E2521]/80 shadow-sm">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase">
                                  {role}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-y-2">
                                <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                  Backplate
                                </div>
                                <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px] text-right">
                                  {(groupedBackplates['LF812'] || []).find(b => b.location?.includes(role))?.serial_number || '-'}
                                </div>
                                <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                  Cylinder
                                </div>
                                <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px] text-right">
                                  {(groupedBackplates['LF812'] || []).find(b => b.location?.includes(role))?.cylinder_serial || '-'}
                                </div>
                              </div>
                              {isServiceDueThisMonth((groupedBackplates['LF812'] || []).find(b => b.location?.includes(role))?.service_due_date ?? null) && (
                                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs mt-2">
                                  <AlertCircle className="h-3 w-3" />
                                  <span>Service Due</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* RFV811 */}
                      <div className="bg-gray-200 dark:bg-[#2E2521] rounded-md overflow-hidden min-h-[480px] border border-gray-200 dark:border-[#FCF6EC]/20">
                        <h3 className="text-xs tracking-[0.2em] uppercase font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] px-4 py-3 border-b border-gray-200 dark:border-[#FCF6EC]/20 bg-white">
                          RFV811
                        </h3>
                        <div className="p-4 space-y-4">
                          {(groupedBackplates['RFV811'] || []).map((backplate, index) => (
                            <div 
                      key={backplate.id}
                              className="p-3 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-sm bg-white dark:bg-[#2E2521]/80 shadow-sm"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase">
                                  Set {index + 1}
                                </span>
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em]">Backplate</span>
                                  <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em]">{backplate.serial_number}</span>
                                </div>
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em]">Cylinder</span>
                                  <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em]">{backplate.cylinder_serial || '-'}</span>
                                </div>
                              </div>
                              {isServiceDueThisMonth(backplate.service_due_date) && (
                                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs">
                                  <AlertCircle className="h-3 w-3" />
                                  <span>Service Due</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    {/* Second Row: MRV811 */}
                    <div className="mt-6">
                      <div className="bg-gray-200 dark:bg-[#2E2521] rounded-md overflow-hidden border border-gray-200 dark:border-[#FCF6EC]/20">
                        <h3 className="text-xs tracking-[0.2em] uppercase font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] px-4 py-3 border-b border-gray-200 dark:border-[#FCF6EC]/20 bg-white">
                          MRV811
                        </h3>
                        <div className="p-4">
                          <div className="grid grid-cols-3 gap-6">
                            {Array.from({ length: 12 }, (_, i) => `Set ${i + 1}`).map((setNumber) => (
                              <div key={setNumber} className="p-3 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-sm bg-white dark:bg-[#2E2521]/80 shadow-sm">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase">
                                    {setNumber}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-y-2">
                                  <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                    Backplate
                                  </div>
                                  <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px] text-right">
                                    {(groupedBackplates['MRV811'] || []).find(b => getRole(b.location) === setNumber)?.serial_number || '-'}
                                  </div>
                                  <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                    Cylinder
                                  </div>
                                  <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px] text-right">
                                    {(groupedBackplates['MRV811'] || []).find(b => getRole(b.location) === setNumber)?.cylinder_serial || '-'}
                                  </div>
                                </div>
                                {isServiceDueThisMonth((groupedBackplates['MRV811'] || []).find(b => getRole(b.location) === setNumber)?.service_due_date ?? null) && (
                                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs mt-2">
                                    <AlertCircle className="h-3 w-3" />
                                    <span>Service Due</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Third Row: Others and SPARE */}
                    <div className="mt-6 grid grid-cols-2 gap-6">
                      {/* Others */}
                      <div className="bg-gray-200 dark:bg-[#2E2521] rounded-md overflow-hidden border border-gray-200 dark:border-[#FCF6EC]/20">
                        <h3 className="text-xs tracking-[0.2em] uppercase font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] px-4 py-3 border-b border-gray-200 dark:border-[#FCF6EC]/20 bg-white">
                          Others
                        </h3>
                        <div className="p-4 space-y-4">
                          {['CFS811'].map((role) => (
                            <div key={role} className="p-3 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-sm bg-white dark:bg-[#2E2521]/80 shadow-sm">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase">
                                  {role}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-y-2">
                                <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                  Backplate
                                </div>
                                <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px] text-right">
                                  {(groupedBackplates['Others'] || []).find(b => b.location?.includes(role))?.serial_number || '-'}
                                </div>
                                <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                  Cylinder
                                </div>
                                <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px] text-right">
                                  {(groupedBackplates['Others'] || []).find(b => b.location?.includes(role))?.cylinder_serial || '-'}
                                </div>
                              </div>
                              {isServiceDueThisMonth((groupedBackplates['Others'] || []).find(b => b.location?.includes(role))?.service_due_date ?? null) && (
                                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs mt-2">
                                  <AlertCircle className="h-3 w-3" />
                                  <span>Service Due</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
            </div>
                      
                      {/* SPARE */}
                      <div className="bg-gray-200 dark:bg-[#2E2521] rounded-md overflow-hidden border border-gray-200 dark:border-[#FCF6EC]/20">
                        <h3 className="text-xs tracking-[0.2em] uppercase font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] px-4 py-3 border-b border-gray-200 dark:border-[#FCF6EC]/20 bg-white">
                          SPARE
                        </h3>
                        <div className="p-4 space-y-4">
                          {(groupedBackplates['SPARE'] || []).slice(0, 4).map((backplate, index) => (
                            <div key={backplate.id} className="p-3 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-sm bg-white dark:bg-[#2E2521]/80 shadow-sm">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase">
                                  Spare {index + 1}
                      </span>
                              </div>
                              <div className="grid grid-cols-2 gap-y-2">
                                <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                  Backplate
                                </div>
                                <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px] text-right">
                                  {backplate.serial_number || '-'}
                                </div>
                                <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                  Cylinder
                                </div>
                                <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px] text-right">
                                  {backplate.cylinder_serial || '-'}
                                </div>
                              </div>
                              {isServiceDueThisMonth(backplate.service_due_date) && (
                                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs mt-2">
                                  <AlertCircle className="h-3 w-3" />
                                  <span>Service Due</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-200 dark:bg-[#2E2521] rounded-md overflow-hidden min-h-[480px] border border-gray-200 dark:border-[#FCF6EC]/20">
                    <h3 className="text-xs tracking-[0.2em] uppercase font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] px-4 py-3 border-b border-gray-200 dark:border-[#FCF6EC]/20 bg-white">
                      {locationFilter}
                    </h3>
                    <div className="p-4 space-y-4">
                      {locationFilter === 'MRV811' || locationFilter === 'RFV811' ? (
                        // For MRV811 and RFV811, display Set 1, Set 2, etc.
                        locationFilter === 'MRV811' ? (
                          <div className="grid grid-cols-3 gap-6">
                            {Array.from({ length: 12 }, (_, i) => `Set ${i + 1}`).map((setNumber) => (
                              <div key={setNumber} className="p-3 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-sm bg-white dark:bg-[#2E2521]/80 shadow-sm">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase">
                                    {setNumber}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-y-2">
                                  <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                    Backplate
                                  </div>
                                  <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px] text-right">
                                    {(groupedBackplates[locationFilter] || []).find(b => getRole(b.location) === setNumber)?.serial_number || '-'}
                                  </div>
                                  <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                    Cylinder
                                  </div>
                                  <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px] text-right">
                                    {(groupedBackplates[locationFilter] || []).find(b => getRole(b.location) === setNumber)?.cylinder_serial || '-'}
                                  </div>
                                </div>
                                {isServiceDueThisMonth((groupedBackplates[locationFilter] || []).find(b => getRole(b.location) === setNumber)?.service_due_date ?? null) && (
                                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs mt-2">
                                    <AlertCircle className="h-3 w-3" />
                                    <span>Service Due</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          // For RFV811, keep the vertical layout
                          Array.from({ length: 4 }, (_, i) => `Set ${i + 1}`).map((setNumber) => (
                            <div key={setNumber} className="p-3 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-sm bg-white dark:bg-[#2E2521]/80 shadow-sm">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase">
                                  {setNumber}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-y-2">
                                <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                  Backplate
                                </div>
                                <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px] text-right">
                                  {(groupedBackplates[locationFilter] || []).find(b => getRole(b.location) === setNumber)?.serial_number || '-'}
                                </div>
                                <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                  Cylinder
                                </div>
                                <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px] text-right">
                                  {(groupedBackplates[locationFilter] || []).find(b => getRole(b.location) === setNumber)?.cylinder_serial || '-'}
                                </div>
                              </div>
                              {isServiceDueThisMonth((groupedBackplates[locationFilter] || []).find(b => getRole(b.location) === setNumber)?.service_due_date ?? null) && (
                                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs mt-2">
                                  <AlertCircle className="h-3 w-3" />
                                  <span>Service Due</span>
                                </div>
                              )}
                            </div>
                          ))
                        )
                      ) : locationFilter === 'SPARE' ? (
                        // For SPARE, just list all spare backplates
                        (groupedBackplates[locationFilter] || []).map((backplate, index) => (
                          <div 
                        key={index}
                            className="p-3 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-sm bg-white dark:bg-[#2E2521]/80 shadow-sm"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase">
                                Spare {index + 1}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-y-2">
                              <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                Backplate
                              </div>
                              <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px] text-right">
                                {backplate.serial_number || '-'}
                              </div>
                              <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                Cylinder
                              </div>
                              <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px] text-right">
                                {backplate.cylinder_serial || '-'}
                              </div>
                            </div>
                            {isServiceDueThisMonth(backplate.service_due_date) && (
                              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs mt-2">
                                <AlertCircle className="h-3 w-3" />
                                <span>Service Due</span>
                              </div>
                            )}
                          </div>
                        ))
                      ) : locationFilter === 'Others' ? (
                        // For Others, use CFS811 as the role
                        ['CFS811'].map((role) => (
                          <div key={role} className="p-3 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-sm bg-white dark:bg-[#2E2521]/80 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase">
                                {role}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-y-2">
                              <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                Backplate
                              </div>
                              <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px] text-right">
                                {(groupedBackplates[locationFilter] || []).find(b => b.location?.includes(role))?.serial_number || '-'}
                              </div>
                              <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                Cylinder
                              </div>
                              <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px] text-right">
                                {(groupedBackplates[locationFilter] || []).find(b => b.location?.includes(role))?.cylinder_serial || '-'}
                              </div>
                            </div>
                            {isServiceDueThisMonth((groupedBackplates[locationFilter] || []).find(b => b.location?.includes(role))?.service_due_date ?? null) && (
                              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs mt-2">
                                <AlertCircle className="h-3 w-3" />
                                <span>Service Due</span>
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        // For LF811, LF812, and others, display SC, PO, FF1, FF2
                        ['SC', 'PO', 'FF1', 'FF2'].map((role) => (
                          <div key={role} className="p-3 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-sm bg-white dark:bg-[#2E2521]/80 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase">
                                {role}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-y-2">
                              <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                Backplate
                              </div>
                              <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px] text-right">
                                {(groupedBackplates[locationFilter] || []).find(b => getRole(b.location) === role)?.serial_number || '-'}
                              </div>
                              <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                Cylinder
                              </div>
                              <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px] text-right">
                                {(groupedBackplates[locationFilter] || []).find(b => getRole(b.location) === role)?.cylinder_serial || '-'}
                              </div>
                            </div>
                            {isServiceDueThisMonth((groupedBackplates[locationFilter] || []).find(b => getRole(b.location) === role)?.service_due_date ?? null) && (
                              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs mt-2">
                                <AlertCircle className="h-3 w-3" />
                                <span>Service Due</span>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
                </div>
            ) : (
              <div className="bg-gray-200 dark:bg-[#2E2521] border border-gray-200 dark:border-[#FCF6EC]/20 rounded-md overflow-hidden">
                {tableView}
            </div>
          )}
        </div>
      </main>
      </div>
    </div>
  )
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 uppercase tracking-[0.2em]">{title}</p>
      <p className="text-[32px] font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[-0.02em]">{value}</p>
    </div>
  );
}

