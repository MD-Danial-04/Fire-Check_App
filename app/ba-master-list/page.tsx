'use client'

import { useState, useEffect } from 'react'
import { Search, Plus, Check, X, List, Grid } from 'lucide-react'
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

const locations = [
  'All Locations',
  'LF811 - SC',
  'LF811 - PO',
  'LF811 - FF1',
  'LF811 - FF2',
  'RFV811',
  'MRV811',
  'SPARE'
]

export default function BAMasterList() {
  const [searchTerm, setSearchTerm] = useState('')
  const [locationFilter, setLocationFilter] = useState('All Locations')
  const [backplates, setBackplates] = useState<BaMasterList[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [view, setView] = useState<'list' | 'grouped'>('list')

  useEffect(() => {
    fetchBAMasterList()
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

  const filteredBackplates = backplates.filter(backplate => {
    const matchesSearch = searchTerm === '' || 
      backplate.serial_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (backplate.cylinder_serial && backplate.cylinder_serial.toLowerCase().includes(searchTerm.toLowerCase()))
    
    const matchesLocation = locationFilter === 'All Locations' || 
      backplate.location === locationFilter

    return matchesSearch && matchesLocation
  })

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
    if (!location) return '-'
    
    // Check for FF1 or FF2 first
    if (location.toUpperCase().includes('FF1')) return 'FF1'
    if (location.toUpperCase().includes('FF2')) return 'FF2'
    
    // Then check for other roles
    const roleMatches = location.toUpperCase().match(/(SC|PO|SET \d+)/g)
    return roleMatches ? roleMatches[0] : '-'
  }

  // Group backplates by base location
  const groupedBackplates = filteredBackplates.reduce((acc, backplate) => {
    const baseLocation = getBaseLocation(backplate.location)
    if (!acc[baseLocation]) {
      acc[baseLocation] = []
    }
    acc[baseLocation].push(backplate)
    return acc
  }, {} as Record<string, BaMasterList[]>)

  // Sort order for locations
  const locationOrder = ['LF811', 'LF812', 'MRV811', 'RFV811', 'SPARE', 'Others', 'Unassigned']
  const sortedLocations = Object.entries(groupedBackplates).sort((a, b) => {
    return locationOrder.indexOf(a[0]) - locationOrder.indexOf(b[0])
  })

  if (isLoading) return <div className="flex-1 flex items-center justify-center">Loading...</div>

  return (
    <div className="flex-1 flex flex-col">
      <header className="border-b border-neutral-100 bg-white">
        <div className="flex h-16 items-center justify-between px-6">
          <h1 className="text-xl font-medium text-neutral-900">BA Master List</h1>
          <div className="flex items-center gap-4">
            <Button className="bg-neutral-900 hover:bg-neutral-800">
              <Plus className="mr-2 h-4 w-4" /> Add Cylinder
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Filters and View Toggle */}
          <div className="flex gap-4 items-center justify-between">
            <div className="flex gap-4 items-center">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <Input 
                  type="search" 
                  placeholder="Search by serial number..." 
                  className="pl-10 bg-neutral-50 border-0 w-full focus-visible:ring-neutral-900"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((location) => (
                    <SelectItem key={location} value={location}>
                      {location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setView('list')}
                className={view === 'list' ? 'bg-neutral-100' : ''}
              >
                <List className="h-4 w-4 mr-2" />
                List View
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setView('grouped')}
                className={view === 'grouped' ? 'bg-neutral-100' : ''}
              >
                <Grid className="h-4 w-4 mr-2" />
                Grouped View
              </Button>
            </div>
          </div>

          {/* Table Views */}
          {view === 'list' ? (
            // Existing List View
            <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[80px] bg-neutral-50 text-sm font-medium text-neutral-500">S/N</TableHead>
                    <TableHead className="w-[180px] bg-neutral-50 text-sm font-medium text-neutral-500">Serial Number</TableHead>
                    <TableHead className="w-[180px] bg-neutral-50 text-sm font-medium text-neutral-500">Cylinder S/R No.</TableHead>
                    <TableHead className="w-[120px] bg-neutral-50 text-sm font-medium text-neutral-500">DOB</TableHead>
                    <TableHead className="w-[120px] bg-neutral-50 text-sm font-medium text-neutral-500">Hydro</TableHead>
                    <TableHead className="w-[120px] bg-neutral-50 text-sm font-medium text-neutral-500">Service Due</TableHead>
                    <TableHead className="w-[150px] bg-neutral-50 text-sm font-medium text-neutral-500">Location</TableHead>
                    <TableHead className="w-[100px] text-center bg-neutral-50 text-sm font-medium text-neutral-500">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBackplates.map((backplate, index) => (
                    <TableRow 
                      key={backplate.id}
                      className={`
                        hover:bg-neutral-50/50
                        ${backplate.location?.includes('MRV811') ? 'bg-orange-50/50' : ''}
                        ${backplate.location === 'SPARE' ? 'bg-neutral-50/50' : ''}
                      `}
                    >
                      <TableCell className="text-sm text-neutral-600">{index + 1}</TableCell>
                      <TableCell className="text-sm font-medium text-neutral-900">
                        {backplate.serial_number}
                      </TableCell>
                      <TableCell className="text-sm text-neutral-600">
                        {backplate.cylinder_serial || '-'}
                      </TableCell>
                      <TableCell className="text-sm text-neutral-600">
                        {backplate.date_of_birth ? new Date(backplate.date_of_birth).toLocaleDateString('en-GB', { 
                          year: 'numeric', 
                          month: 'short'
                        }) : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-neutral-600">
                        {backplate.hydro_date ? new Date(backplate.hydro_date).toLocaleDateString('en-GB', {
                          year: '2-digit',
                          month: 'short'
                        }) : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-neutral-600">
                        {backplate.service_due_date ? new Date(backplate.service_due_date).toLocaleDateString('en-GB', {
                          year: '2-digit',
                          month: 'short'
                        }) : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-neutral-600">
                        {backplate.location || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center">
                          {!backplate.is_spare ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <X className="h-4 w-4 text-neutral-400" />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            // Grouped View
            <div className="grid grid-cols-1 gap-6">
              {sortedLocations.map(([location, backplates]) => (
                <div key={location} className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
                  <div className="px-6 py-4 border-b border-neutral-200 bg-neutral-50">
                    <div className="flex justify-between items-center">
                      <h2 className="text-lg font-medium text-neutral-900">{location}</h2>
                      <span className="px-3 py-1 rounded-full bg-neutral-100 text-sm text-neutral-600">
                        {backplates.length} cylinders
                      </span>
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[80px] bg-neutral-50 text-sm font-medium text-neutral-500">S/N</TableHead>
                        <TableHead className="w-[180px] bg-neutral-50 text-sm font-medium text-neutral-500">Serial Number</TableHead>
                        <TableHead className="w-[180px] bg-neutral-50 text-sm font-medium text-neutral-500">Cylinder S/R No.</TableHead>
                        <TableHead className="w-[100px] bg-neutral-50 text-sm font-medium text-neutral-500">Role</TableHead>
                        <TableHead className="w-[120px] bg-neutral-50 text-sm font-medium text-neutral-500">DOB</TableHead>
                        <TableHead className="w-[120px] bg-neutral-50 text-sm font-medium text-neutral-500">Hydro</TableHead>
                        <TableHead className="w-[120px] bg-neutral-50 text-sm font-medium text-neutral-500">Service Due</TableHead>
                        <TableHead className="w-[100px] text-center bg-neutral-50 text-sm font-medium text-neutral-500">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {backplates.map((backplate, index) => (
                        <TableRow 
                          key={backplate.id}
                          className="hover:bg-neutral-50/50"
                        >
                          <TableCell className="text-sm text-neutral-600">{index + 1}</TableCell>
                          <TableCell className="text-sm font-medium text-neutral-900">
                            {backplate.serial_number}
                          </TableCell>
                          <TableCell className="text-sm text-neutral-600">
                            {backplate.cylinder_serial || '-'}
                          </TableCell>
                          <TableCell className="text-sm font-medium text-neutral-600">
                            {getRole(backplate.location)}
                          </TableCell>
                          <TableCell className="text-sm text-neutral-600">
                            {backplate.date_of_birth ? new Date(backplate.date_of_birth).toLocaleDateString('en-GB', { 
                              year: 'numeric', 
                              month: 'short'
                            }) : '-'}
                          </TableCell>
                          <TableCell className="text-sm text-neutral-600">
                            {backplate.hydro_date ? new Date(backplate.hydro_date).toLocaleDateString('en-GB', {
                              year: '2-digit',
                              month: 'short'
                            }) : '-'}
                          </TableCell>
                          <TableCell className="text-sm text-neutral-600">
                            {backplate.service_due_date ? new Date(backplate.service_due_date).toLocaleDateString('en-GB', {
                              year: '2-digit',
                              month: 'short'
                            }) : '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-center">
                              {!backplate.is_spare ? (
                                <Check className="h-4 w-4 text-green-600" />
                              ) : (
                                <X className="h-4 w-4 text-neutral-400" />
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

