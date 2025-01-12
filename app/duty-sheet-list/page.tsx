'use client'

import { useState, useEffect } from 'react'
import { getDutySheet, updatePersonnelStatus } from '@/lib/queries'
import { Personnel } from '@/types/database'
import { Check, Bell, Settings, Search } from 'lucide-react'
import { Button } from "@/components/ui/button"
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
import { supabase } from '@/lib/supabase'

export default function DutyChecklist() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [isClient, setIsClient] = useState(false)
  const [personnel, setPersonnel] = useState<Personnel[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsClient(true)
    fetchDutySheet()

    // Set up real-time subscription
    const channel = supabase
      .channel('duty_sheet_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'personnel',
        },
        async () => {
          // Refetch data when any change occurs
          await fetchDutySheet()
        }
      )
      .subscribe()

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel)
    }
  }, [date])

  const fetchDutySheet = async () => {
    try {
      setIsLoading(true)
      const data = await getDutySheet(date)
      if (data?.personnel) {
        setPersonnel(data.personnel)
      }
    } catch (error) {
      console.error('Error fetching duty sheet:', error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleStatusChange = async (personnelId: number, isWorking: boolean) => {
    try {
      await updatePersonnelStatus(personnelId, isWorking)
      setPersonnel(personnel.map(p => 
        p.id === personnelId ? { ...p, is_working: isWorking } : p
      ))
    } catch (error) {
      console.error('Error updating status:', error)
    }
  }

  if (!isClient) return null
  if (isLoading) return <div>Loading...</div>

  return (
    <div className="flex-1 flex flex-col">
      <header className="border-b border-neutral-100 bg-white">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative w-96">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input 
                type="search" 
                placeholder="Search..." 
                className="pl-10 bg-neutral-50 border-0 w-full focus-visible:ring-neutral-900"
                aria-label="Search"
                role="searchbox"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-neutral-500"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-neutral-500"
              aria-label="Settings"
            >
              <Settings className="h-5 w-5" />
            </Button>
            <div className="h-8 w-8 rounded-full bg-neutral-200"></div>
          </div>
        </div>
      </header>

      <header className="border-b border-neutral-100 bg-white">
        <div className="flex h-16 items-center justify-between px-6">
          <h1 className="text-2xl font-medium text-neutral-900">Daily PPE Check</h1>
          <div className="flex items-center gap-4">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 rounded-md border border-neutral-200 text-sm"
            />
            <Button className="bg-neutral-900 hover:bg-neutral-800">
              <Check className="mr-2 h-4 w-4" /> Save Changes
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[200px] text-sm font-medium text-neutral-600" rowSpan={2}>REGULARS</TableHead>
                    <TableHead className="w-[120px] text-sm font-medium text-neutral-600" rowSpan={2}>STATUS</TableHead>
                    <TableHead className="text-center text-sm font-medium text-neutral-600" colSpan={2}>VESSEL BA SET</TableHead>
                    <TableHead className="text-center text-sm font-medium text-neutral-600" colSpan={2}>LFAV BA SET</TableHead>
                    <TableHead className="w-[100px] text-sm font-medium text-neutral-600" rowSpan={2}>CHECK</TableHead>
                  </TableRow>
                  <TableRow className="hover:bg-transparent border-b-0">
                    <TableHead className="text-sm font-medium text-neutral-600">Backplate S/N</TableHead>
                    <TableHead className="text-sm font-medium text-neutral-600">Cylinder S/N</TableHead>
                    <TableHead className="text-sm font-medium text-neutral-600">Backplate S/N</TableHead>
                    <TableHead className="text-sm font-medium text-neutral-600">Cylinder S/N</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {personnel.map(p => (
                    <PersonnelRow 
                      key={p.id}
                      personnel={p}
                      onStatusChange={handleStatusChange}
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[200px] text-sm font-medium text-neutral-500" rowSpan={2}>NS SECTION COMMANDER</TableHead>
                    <TableHead className="w-[120px] text-sm font-medium text-neutral-500" rowSpan={2}>STATUS</TableHead>
                    <TableHead className="text-center text-sm font-medium text-neutral-500" colSpan={2}>VESSEL BA SET</TableHead>
                    <TableHead className="text-center text-sm font-medium text-neutral-500" colSpan={2}>LFAV BA SET</TableHead>
                    <TableHead className="w-[100px] text-sm font-medium text-neutral-500" rowSpan={2}>CHECK</TableHead>
                  </TableRow>
                  <TableRow className="hover:bg-transparent border-b-0">
                    <TableHead className="text-sm font-medium text-neutral-500">Backplate S/N</TableHead>
                    <TableHead className="text-sm font-medium text-neutral-500">Cylinder S/N</TableHead>
                    <TableHead className="text-sm font-medium text-neutral-500">Backplate S/N</TableHead>
                    <TableHead className="text-sm font-medium text-neutral-500">Cylinder S/N</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <PersonnelRow 
                    name="SGT1 Naufal"
                    defaultChecked={true}
                    vesselBackplate="BSTJ-3099"
                    vesselCylinder="BRCB-2833"
                    lfavBackplate="BSTJ-2990"
                    lfavCylinder="BRCB-2887"
                  />
                  <PersonnelRow 
                    name="SGT1 Abdullah"
                    defaultChecked={true}
                    vesselBackplate="BSTJ-3106"
                    vesselCylinder="BSNN-0146"
                    lfavBackplate="BSTJ-3042"
                    lfavCylinder="BSNE-1570"
                  />
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[200px] text-sm font-medium text-neutral-600" rowSpan={2}>NS MARINE FIREFIGHTER</TableHead>
                    <TableHead className="w-[120px] text-sm font-medium text-neutral-600" rowSpan={2}>STATUS</TableHead>
                    <TableHead className="text-center text-sm font-medium text-neutral-600" colSpan={2}>VESSEL BA SET</TableHead>
                    <TableHead className="text-center text-sm font-medium text-neutral-600" colSpan={2}>LFAV BA SET</TableHead>
                    <TableHead className="w-[100px] text-sm font-medium text-neutral-600" rowSpan={2}>CHECK</TableHead>
                  </TableRow>
                  <TableRow className="hover:bg-transparent border-b-0">
                    <TableHead className="text-sm font-medium text-neutral-600">Backplate S/N</TableHead>
                    <TableHead className="text-sm font-medium text-neutral-600">Cylinder S/N</TableHead>
                    <TableHead className="text-sm font-medium text-neutral-600">Backplate S/N</TableHead>
                    <TableHead className="text-sm font-medium text-neutral-600">Cylinder S/N</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <PersonnelRow 
                    name="CPL Iman"
                    defaultChecked={false}
                  />
                  <PersonnelRow 
                    name="SGT Haroon"
                    defaultChecked={true}
                    vesselBackplate="BSTJ-3088"
                    vesselCylinder="BRCA-1119"
                    lfavBackplate="BSTJ-2995"
                    lfavCylinder="BSNE-1570"
                  />
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[200px] text-sm font-medium text-neutral-600" rowSpan={2}>ORNS/VES</TableHead>
                    <TableHead className="w-[120px] text-sm font-medium text-neutral-600" rowSpan={2}>STATUS</TableHead>
                    <TableHead className="text-center text-sm font-medium text-neutral-600" colSpan={2}>VESSEL BA SET</TableHead>
                    <TableHead className="text-center text-sm font-medium text-neutral-600" colSpan={2}>LFAV BA SET</TableHead>
                    <TableHead className="w-[100px] text-sm font-medium text-neutral-600" rowSpan={2}>CHECK</TableHead>
                  </TableRow>
                  <TableRow className="hover:bg-transparent border-b-0">
                    <TableHead className="text-sm font-medium text-neutral-600">Backplate S/N</TableHead>
                    <TableHead className="text-sm font-medium text-neutral-600">Cylinder S/N</TableHead>
                    <TableHead className="text-sm font-medium text-neutral-600">Backplate S/N</TableHead>
                    <TableHead className="text-sm font-medium text-neutral-600">Cylinder S/N</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <PersonnelRow 
                    name="SGT HAFIZ (ORNS)"
                    defaultChecked={true}
                    vesselBackplate="BSTJ-3104"
                    vesselCylinder="BRCA-1124"
                  />
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

interface PersonnelRowProps {
  personnel?: Personnel
  onStatusChange?: (id: number, isWorking: boolean) => void
  // For static data
  name?: string
  defaultChecked?: boolean
  vesselBackplate?: string
  vesselCylinder?: string
  lfavBackplate?: string
  lfavCylinder?: string
}

function PersonnelRow({ personnel, onStatusChange, name, defaultChecked, vesselBackplate, vesselCylinder, lfavBackplate, lfavCylinder }: PersonnelRowProps) {
  // Use either database or static data
  const displayName = personnel ? `${personnel.rank} ${personnel.name}` : name
  const isWorking = personnel?.is_working ?? defaultChecked

  return (
    <TableRow>
      <TableCell className="font-medium text-sm text-neutral-900">
        {displayName}
      </TableCell>
      <TableCell>
        <span className={`inline-flex px-3 py-1.5 rounded-md text-sm font-medium ${
          isWorking ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {isWorking ? 'Working' : 'Not Working'}
        </span>
      </TableCell>
      <TableCell className="text-sm text-neutral-600">
        {personnel?.vessel_backplate || vesselBackplate || '-'}
      </TableCell>
      <TableCell className="text-sm text-neutral-600">
        {personnel?.vessel_cylinder || vesselCylinder || '-'}
      </TableCell>
      <TableCell className="text-sm text-neutral-600">
        {personnel?.lfav_backplate || lfavBackplate || '-'}
      </TableCell>
      <TableCell className="text-sm text-neutral-600">
        {personnel?.lfav_cylinder || lfavCylinder || '-'}
      </TableCell>
      <TableCell>
        <input
          type="checkbox"
          checked={isWorking}
          onChange={(e) => personnel && onStatusChange?.(personnel.id, e.target.checked)}
          className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-950"
        />
      </TableCell>
    </TableRow>
  )
}

