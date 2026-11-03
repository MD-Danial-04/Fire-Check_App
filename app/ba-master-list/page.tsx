'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, MapPin, Plus, Check, X, List, Grid, Filter, AlertCircle, ExternalLink, FileCheck, Pencil, ChevronDown } from 'lucide-react'
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
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import BAMovementsTable from '../components/BAMovementsTable'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { format } from 'date-fns'
import { BAValidationPanel } from '@/app/components/BAValidationPanel'
import { useToast } from '@/components/ui/use-toast'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { updateBAMasterList } from '@/lib/queries'

const locations = [
  'All Locations',
  'MRV811',
  'RFV811',
  'LF811',
  'LF812',
  'CFS811',
  'Others',
  'SPARE'
]

// Helper function to get base location
const getBaseLocation = (location: string | null, isSpare: boolean | undefined): string => {
  // If it's marked as spare, always return SPARE category
  if (isSpare) return 'SPARE';
  
  if (!location) return 'Unassigned';
  
  const baseLocations = ['LF811', 'LF812', 'MRV811', 'RFV811', 'CFS811']
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

const GENERIC_SPARE_LOCATIONS = new Set(['SPARE', 'SPARE CYLINDERS', 'SPARE BACKPLATES'])

// Spare rows with a specific location label (for example "MRV Spares") keep that
// label as the card title. Generic spare locations still split into cylinders and backplates.
const getSpareDisplayName = (ba: Pick<BaMasterList, 'location' | 'cylinder_serial' | 'serial_number'>): string => {
  const location = ba.location?.trim()
  if (location && !GENERIC_SPARE_LOCATIONS.has(location.toUpperCase())) {
    return location
  }
  if (ba.cylinder_serial && !ba.serial_number) return 'SPARE CYLINDERS'
  if (ba.serial_number && !ba.cylinder_serial) return 'SPARE BACKPLATES'
  return 'SPARE'
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

// Helper function to check if service is due this month
const isServiceDueThisMonth = (hydroDate: string | null): boolean => {
  if (!hydroDate) return false;
  const today = new Date();
  const hydro = new Date(hydroDate);
  return (
    today.getFullYear() === hydro.getFullYear() &&
    today.getMonth() === hydro.getMonth()
  );
};

// Helper function to check if service is due next month
const isServiceDueNextMonth = (hydroDate: string | null): boolean => {
  if (!hydroDate) return false;
  const today = new Date();
  let nextMonth = new Date(today);
  nextMonth.setMonth(today.getMonth() + 1);
  
  const hydro = new Date(hydroDate);
  return (
    hydro.getFullYear() === nextMonth.getFullYear() &&
    hydro.getMonth() === nextMonth.getMonth()
  );
};

// Helper function to check if service is due later this year
const isServiceDueThisYear = (hydroDate: string | null): boolean => {
  if (!hydroDate) return false;
  const today = new Date();
  const hydro = new Date(hydroDate);

  // Check if it's due this year but not this month or next month
  return (
    hydro.getFullYear() === today.getFullYear() &&
    hydro.getMonth() > today.getMonth() + 1
  );
};

// Helper function to check if service is due next year
const isServiceDueNextYear = (hydroDate: string | null): boolean => {
  if (!hydroDate) return false;
  const today = new Date();
  const hydro = new Date(hydroDate);
  
  return hydro.getFullYear() === today.getFullYear() + 1;
};

// Helper function to get hydrostatic due status
const getHydroTestDueStatus = (hydroDate: string | null): 'current' | 'nextMonth' | 'thisYear' | 'nextYear' | 'future' | null => {
  if (!hydroDate) return null;
  
  if (isServiceDueThisMonth(hydroDate)) return 'current';
  if (isServiceDueNextMonth(hydroDate)) return 'nextMonth';
  if (isServiceDueThisYear(hydroDate)) return 'thisYear';
  if (isServiceDueNextYear(hydroDate)) return 'nextYear';
  
  const hydro = new Date(hydroDate);
  const today = new Date();
  
  if (hydro > today) return 'future';
  
  return null;
};

const isServiceOverdue = (hydroDate: string | null): boolean => {
  if (!hydroDate) return false;
  const today = new Date();
  const hydro = new Date(hydroDate);
  return today > hydro;
};

// Helper function to get the status text based on due status
const getHydroStatusText = (status: 'current' | 'nextMonth' | 'thisYear' | 'nextYear' | 'future' | null): string => {
  switch (status) {
    case 'current': return 'Hydrostatic Test Due This Month';
    case 'nextMonth': return 'Hydrostatic Test Due Next Month';
    case 'thisYear': return 'Hydrostatic Test Due Later This Year';
    case 'nextYear': return 'Hydrostatic Test Due Next Year';
    case 'future': return 'Hydrostatic Test Due In Future';
    default: return '';
  }
};

// Helper function to get the appropriate class for the status color
const getHydroStatusClass = (status: 'current' | 'nextMonth' | 'thisYear' | 'nextYear' | 'future' | null): string => {
  switch (status) {
    case 'current': return 'text-amber-600 dark:text-amber-400';
    case 'nextMonth': return 'text-orange-500 dark:text-orange-400';
    case 'thisYear': return 'text-blue-600 dark:text-blue-400';
    case 'nextYear': return 'text-green-600 dark:text-green-500';
    case 'future': return 'text-green-600/70 dark:text-green-500/70';
    default: return '';
  }
};

// Helper function to get background color class for table rows
const getHydroStatusBgClass = (status: 'current' | 'nextMonth' | 'thisYear' | 'nextYear' | 'future' | null): string => {
  switch (status) {
    case 'current': return 'bg-amber-50 dark:bg-amber-900/30';
    case 'nextMonth': return 'bg-orange-50 dark:bg-orange-900/20';
    case 'thisYear': return 'bg-blue-50 dark:bg-blue-900/10';
    case 'nextYear': return 'bg-green-50 dark:bg-green-900/10';
    default: return '';
  }
};

export default function BAMasterList() {
  const [searchTerm, setSearchTerm] = useState('')
  const [locationFilter, setLocationFilter] = useState('All Locations')
  const [backplates, setBackplates] = useState<BaMasterList[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [view, setView] = useState<'list' | 'grouped'>('grouped')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [showMobileSearch, setShowMobileSearch] = useState(false)
  const [selectedBaId, setSelectedBaId] = useState<number | null>(null)
  const [showMovements, setShowMovements] = useState(false)
  const [swapType, setSwapType] = useState<'BA' | 'CYLINDER'>('BA')
  const [showValidation, setShowValidation] = useState(false)
  const { toast } = useToast()

  // Edit flow - all fields
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editBa, setEditBa] = useState<BaMasterList | null>(null)
  const [baForm, setBaForm] = useState<{
    serial_number: string;
    cylinder_serial: string;
    date_of_birth: string;
    hydro_date: string;
    service_due_date: string;
    location: string;
    is_spare: boolean;
    telemetry_id: string;
    remarks: string;
  }>({
    serial_number: '',
    cylinder_serial: '',
    date_of_birth: '',
    hydro_date: '',
    service_due_date: '',
    location: '',
    is_spare: false,
    telemetry_id: '',
    remarks: '',
  })
  // Store original values to detect changes
  const [originalBaForm, setOriginalBaForm] = useState<{
    serial_number: string;
    cylinder_serial: string;
    date_of_birth: string;
    hydro_date: string;
    service_due_date: string;
    location: string;
    is_spare: boolean;
    telemetry_id: string;
    remarks: string;
  }>({
    serial_number: '',
    cylinder_serial: '',
    date_of_birth: '',
    hydro_date: '',
    service_due_date: '',
    location: '',
    is_spare: false,
    telemetry_id: '',
    remarks: '',
  })
  const [isSavingBa, setIsSavingBa] = useState(false)
  
  // Swap tracking
  const [swapTargets, setSwapTargets] = useState<{ backplate: BaMasterList | null; cylinder: BaMasterList | null }>({
    backplate: null,
    cylinder: null,
  })
  const [isSwapping, setIsSwapping] = useState<{ backplate: boolean; cylinder: boolean }>({
    backplate: false,
    cylinder: false,
  })
  const [isCreatingNew, setIsCreatingNew] = useState<{ backplate: boolean; cylinder: boolean }>({
    backplate: false,
    cylinder: false
  })
  
  // Two-column dropdown states
  const [backplateDropdownOpen, setBackplateDropdownOpen] = useState(false)
  const [cylinderDropdownOpen, setCylinderDropdownOpen] = useState(false)
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false)
  const [selectedBackplateLocation, setSelectedBackplateLocation] = useState<string>('')
  const [selectedCylinderLocation, setSelectedCylinderLocation] = useState<string>('')
  const [selectedLocationStation, setSelectedLocationStation] = useState<string>('')

  // Refs for click outside handling
  const backplateDropdownRef = useRef<HTMLDivElement>(null)
  const cylinderDropdownRef = useRef<HTMLDivElement>(null)
  const locationDropdownRef = useRef<HTMLDivElement>(null)

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (backplateDropdownRef.current && !backplateDropdownRef.current.contains(event.target as Node)) {
        setBackplateDropdownOpen(false)
      }
      if (cylinderDropdownRef.current && !cylinderDropdownRef.current.contains(event.target as Node)) {
        setCylinderDropdownOpen(false)
      }
      if (locationDropdownRef.current && !locationDropdownRef.current.contains(event.target as Node)) {
        setLocationDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleOpenEdit = (ba: BaMasterList) => {
    setEditBa(ba)
    const formData = {
      serial_number: ba.serial_number || '',
      cylinder_serial: ba.cylinder_serial || '',
      date_of_birth: ba.date_of_birth ? ba.date_of_birth.slice(0, 10) : '',
      hydro_date: ba.hydro_date ? ba.hydro_date.slice(0, 10) : '',
      service_due_date: ba.service_due_date || '',
      location: ba.location || '',
      is_spare: !!ba.is_spare,
      telemetry_id: ba.telemetry_id || '',
      remarks: ba.remarks || '',
    }
    setBaForm(formData)
    // Store original values for change detection
    setOriginalBaForm({ ...formData })
    // Reset swap states
    setSwapTargets({ backplate: null, cylinder: null })
    setIsSwapping({ backplate: false, cylinder: false })
    setIsCreatingNew({ backplate: false, cylinder: false })
    setSelectedBackplateLocation('')
    setSelectedCylinderLocation('')
    setSelectedLocationStation('')
    setBackplateDropdownOpen(false)
    setCylinderDropdownOpen(false)
    setLocationDropdownOpen(false)
    setIsEditOpen(true)
  }

  const handleFormChange = (field: keyof typeof baForm, value: string | boolean) => {
    setBaForm(prev => ({ ...prev, [field]: value as any }))
  }

  // Helper function to check if a field has changed
  const isFieldChanged = (field: keyof typeof baForm) => {
    return baForm[field] !== originalBaForm[field]
  }

  // Helper function to get highlight classes for changed fields
  const getFieldHighlightClass = (field: keyof typeof baForm) => {
    return isFieldChanged(field) 
      ? "border-orange-300 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-700" 
      : ""
  }

  // Helper function to get filtered backplates
  const getFilteredBackplates = () => {
    return backplates.filter(b => {
      if (!b.serial_number || b.serial_number === editBa?.serial_number) return false
      if (!selectedBackplateLocation) return true
      const baseLocation = getBaseLocation(b.location, b.is_spare)
      return baseLocation === selectedBackplateLocation
    })
  }

  // Helper function to get filtered cylinders
  const getFilteredCylinders = () => {
    return backplates.filter(b => {
      if (!b.cylinder_serial || b.cylinder_serial === editBa?.cylinder_serial) return false
      if (!selectedCylinderLocation) return true
      const baseLocation = getBaseLocation(b.location, b.is_spare)
      return baseLocation === selectedCylinderLocation
    })
  }

  // Get unique locations for filtering
  const getAvailableLocations = (type: 'backplate' | 'cylinder') => {
    const locationSet = new Set<string>()
    backplates.forEach(b => {
      const hasSerial = type === 'backplate' ? b.serial_number : b.cylinder_serial
      const isNotCurrent = type === 'backplate' ? 
        b.serial_number !== editBa?.serial_number : 
        b.cylinder_serial !== editBa?.cylinder_serial
      
      if (hasSerial && isNotCurrent) {
        const baseLocation = getBaseLocation(b.location, b.is_spare)
        locationSet.add(baseLocation)
      }
    })
    
    const locationOrder = ['LF811', 'LF812', 'MRV811', 'RFV811', 'CFS811', 'SPARE', 'Others', 'Unassigned']
    return Array.from(locationSet).sort((a, b) => {
      return locationOrder.indexOf(a) - locationOrder.indexOf(b)
    })
  }

  // Handle backplate selection from two-column dropdown
  const handleBackplateDropdownSelection = (value: string) => {
    if (value === 'CREATE_NEW') {
      handleBackplateSelection(value)
      setBackplateDropdownOpen(false)
    } else if (value && value !== selectedBackplateLocation) {
      // This is a serial number selection
      handleBackplateSelection(value)
      setBackplateDropdownOpen(false)
    }
  }

  // Handle cylinder selection from two-column dropdown
  const handleCylinderDropdownSelection = (value: string) => {
    if (value === 'CREATE_NEW') {
      handleCylinderSelection(value)
      setCylinderDropdownOpen(false)
    } else if (value && value !== selectedCylinderLocation) {
      // This is a serial number selection
      handleCylinderSelection(value)
      setCylinderDropdownOpen(false)
    }
  }

  // Group backplates by location for two-column display
  const getBackplatesByLocation = () => {
    const locationGroups: Record<string, BaMasterList[]> = {}
    
    backplates
      .filter(b => b.serial_number && b.serial_number !== editBa?.serial_number)
      .forEach(b => {
        const baseLocation = getBaseLocation(b.location, b.is_spare)
        if (!locationGroups[baseLocation]) {
          locationGroups[baseLocation] = []
        }
        locationGroups[baseLocation].push(b)
      })
    
    return locationGroups
  }

  // Group cylinders by location for two-column display
  const getCylindersByLocation = () => {
    const locationGroups: Record<string, BaMasterList[]> = {}
    
    backplates
      .filter(b => b.cylinder_serial && b.cylinder_serial !== editBa?.cylinder_serial)
      .forEach(b => {
        const baseLocation = getBaseLocation(b.location, b.is_spare)
        if (!locationGroups[baseLocation]) {
          locationGroups[baseLocation] = []
        }
        locationGroups[baseLocation].push(b)
      })
    
    return locationGroups
  }

  // Handle backplate selection (swap or new)
  const handleBackplateSelection = (selectedSerialNumber: string) => {
    if (selectedSerialNumber === 'CREATE_NEW') {
      setIsCreatingNew(prev => ({ ...prev, backplate: true }))
      setIsSwapping(prev => ({ ...prev, backplate: false }))
      setSwapTargets(prev => ({ ...prev, backplate: null }))
      // Clear backplate data for new entry
      setBaForm(prev => ({
        ...prev,
        serial_number: '',
        telemetry_id: '',
      }))
      return
    }

    // If selecting current backplate, just reset states
    if (selectedSerialNumber === editBa?.serial_number) {
      setIsSwapping(prev => ({ ...prev, backplate: false }))
      setSwapTargets(prev => ({ ...prev, backplate: null }))
      setIsCreatingNew(prev => ({ ...prev, backplate: false }))
      setBaForm(prev => ({
        ...prev,
        serial_number: editBa.serial_number || '',
        telemetry_id: editBa.telemetry_id || '',
      }))
      return
    }

    // Find the selected backplate for swap
    const selectedBa = backplates.find(b => b.serial_number === selectedSerialNumber)
    if (!selectedBa) return

    setSwapTargets(prev => ({ ...prev, backplate: selectedBa }))
    setIsSwapping(prev => ({ ...prev, backplate: true }))
    setIsCreatingNew(prev => ({ ...prev, backplate: false }))
    
    // Update form with selected backplate data
    setBaForm(prev => ({
      ...prev,
      serial_number: selectedBa.serial_number || '',
      telemetry_id: selectedBa.telemetry_id || '',
    }))
  }

  // Handle cylinder selection (swap or new)
  const handleCylinderSelection = (selectedSerialNumber: string) => {
    if (selectedSerialNumber === 'CREATE_NEW') {
      setIsCreatingNew(prev => ({ ...prev, cylinder: true }))
      setIsSwapping(prev => ({ ...prev, cylinder: false }))
      setSwapTargets(prev => ({ ...prev, cylinder: null }))
      // Clear cylinder data for new entry
      setBaForm(prev => ({
        ...prev,
        cylinder_serial: '',
        date_of_birth: '',
        hydro_date: '',
        service_due_date: '',
      }))
      return
    }

    // If selecting current cylinder, just reset states
    if (selectedSerialNumber === editBa?.cylinder_serial) {
      setIsSwapping(prev => ({ ...prev, cylinder: false }))
      setSwapTargets(prev => ({ ...prev, cylinder: null }))
      setIsCreatingNew(prev => ({ ...prev, cylinder: false }))
      setBaForm(prev => ({
        ...prev,
        cylinder_serial: editBa.cylinder_serial || '',
        date_of_birth: editBa.date_of_birth ? editBa.date_of_birth.slice(0, 10) : '',
        hydro_date: editBa.hydro_date ? editBa.hydro_date.slice(0, 10) : '',
        service_due_date: editBa.service_due_date || '',
      }))
      return
    }

    // Find the selected cylinder for swap
    const selectedBa = backplates.find(b => b.cylinder_serial === selectedSerialNumber)
    if (!selectedBa) return

    setSwapTargets(prev => ({ ...prev, cylinder: selectedBa }))
    setIsSwapping(prev => ({ ...prev, cylinder: true }))
    setIsCreatingNew(prev => ({ ...prev, cylinder: false }))
    
    // Update form with selected cylinder data
    setBaForm(prev => ({
      ...prev,
      cylinder_serial: selectedBa.cylinder_serial || '',
      date_of_birth: selectedBa.date_of_birth ? selectedBa.date_of_birth.slice(0, 10) : '',
      hydro_date: selectedBa.hydro_date ? selectedBa.hydro_date.slice(0, 10) : '',
      service_due_date: selectedBa.service_due_date || '',
    }))
  }

  const handleSaveBa = async () => {
    if (!editBa) return
    setIsSavingBa(true)
    try {
      const operations = []

      // Prepare updates for current BA with proper date formatting
      const currentUpdates: Partial<BaMasterList> = {
        serial_number: baForm.serial_number,
        cylinder_serial: baForm.cylinder_serial,
        date_of_birth: baForm.date_of_birth ? new Date(baForm.date_of_birth).toISOString() : null,
        hydro_date: baForm.hydro_date ? new Date(baForm.hydro_date).toISOString() : null,
        service_due_date: baForm.service_due_date || null,
        location: baForm.location,
        is_spare: baForm.is_spare,
        telemetry_id: baForm.telemetry_id,
        remarks: baForm.remarks,
      }

      // Update current BA
      operations.push(updateBAMasterList(editBa.id, currentUpdates))

      // Handle swaps per component
      const baseIsSpare = (b: BaMasterList) => getBaseLocation(b.location, b.is_spare) === 'SPARE'

      // Backplate swap
      if (isSwapping.backplate && swapTargets.backplate) {
        const t = swapTargets.backplate
        const swapB: Partial<BaMasterList> = {
          serial_number: editBa.serial_number,
          telemetry_id: editBa.telemetry_id,
        }
        if (baseIsSpare(t)) {
          swapB.cylinder_serial = ''
          swapB.date_of_birth = null
          swapB.hydro_date = null
          swapB.service_due_date = null
          swapB.remarks = `Backplate moved from ${editBa.location}`
        }
        operations.push(updateBAMasterList(t.id, swapB))
      }

      // Cylinder swap
      if (isSwapping.cylinder && swapTargets.cylinder) {
        const t = swapTargets.cylinder
        const swapC: Partial<BaMasterList> = {
          cylinder_serial: editBa.cylinder_serial,
          date_of_birth: editBa.date_of_birth,
          hydro_date: editBa.hydro_date,
          service_due_date: editBa.service_due_date,
        }
        if (baseIsSpare(t)) {
          swapC.serial_number = ''
          swapC.telemetry_id = ''
          swapC.remarks = `Cylinder moved from ${editBa.location}`
        }
        operations.push(updateBAMasterList(t.id, swapC))
      }

      // Handle new entries (old components become spare)
      if (isCreatingNew.backplate && editBa.serial_number) {
        // Create new spare entry for old backplate ONLY (no cylinder info)
        const newSpareBackplate = {
          serial_number: editBa.serial_number,
          telemetry_id: editBa.telemetry_id,
          cylinder_serial: '', // Empty - this is just a spare backplate
          date_of_birth: null,
          hydro_date: null,
          service_due_date: null,
          location: 'SPARE',
          is_spare: true,
          remarks: `Backplate moved from ${editBa.location}`,
        }
        // Note: We'll need to add a createBAMasterList function for this
      }

      if (isCreatingNew.cylinder && editBa.cylinder_serial) {
        // Create new spare entry for old cylinder ONLY (no backplate info)
        const newSpareCylinder = {
          serial_number: '', // Empty - this is just a spare cylinder
          telemetry_id: null,
          cylinder_serial: editBa.cylinder_serial,
          date_of_birth: editBa.date_of_birth,
          hydro_date: editBa.hydro_date,
          service_due_date: editBa.service_due_date,
          location: 'SPARE',
          is_spare: true,
          remarks: `Cylinder moved from ${editBa.location}`,
        }
        // Note: We'll need to add a createBAMasterList function for this
      }

      // Execute all operations
      await Promise.all(operations)

      // Optimistic in-memory update for current BA
      setBackplates(prev => prev.map(b => {
        if (b.id === editBa.id) {
          return { ...b, ...currentUpdates }
        }
        // Also update swap targets if exist
        if (swapTargets.backplate && b.id === swapTargets.backplate.id && isSwapping.backplate) {
          const t = swapTargets.backplate
          const up: Partial<BaMasterList> = { serial_number: editBa.serial_number, telemetry_id: editBa.telemetry_id }
          if (baseIsSpare(t)) { up.cylinder_serial = ''; up.date_of_birth = null; up.hydro_date = null; up.service_due_date = null; up.remarks = `Backplate moved from ${editBa.location}` }
          return { ...b, ...up }
        }
        if (swapTargets.cylinder && b.id === swapTargets.cylinder.id && isSwapping.cylinder) {
          const t = swapTargets.cylinder
          const up: Partial<BaMasterList> = { cylinder_serial: editBa.cylinder_serial, date_of_birth: editBa.date_of_birth, hydro_date: editBa.hydro_date, service_due_date: editBa.service_due_date }
          if (baseIsSpare(t)) { up.serial_number = ''; up.telemetry_id = ''; up.remarks = `Cylinder moved from ${editBa.location}` }
          return { ...b, ...up }
        }
        return b
      }))

      toast({ title: 'Saved', description: (isSwapping.backplate || isSwapping.cylinder) ? 'BA swap completed.' : 'BA particulars updated.' })
      setIsEditOpen(false)
      setEditBa(null)
      setSwapTargets({ backplate: null, cylinder: null })
      setIsSwapping({ backplate: false, cylinder: false })
      setIsCreatingNew({ backplate: false, cylinder: false })
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to save', variant: 'destructive' })
    } finally {
      setIsSavingBa(false)
    }
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

  // Calculate stats from backplates
  const stats = {
    total: backplates.length,
    inService: backplates.filter(b => !b.is_spare).length,
    dueService: backplates.filter(b => isServiceDueThisMonth(b.hydro_date)).length,
    dueNextMonth: backplates.filter(b => isServiceDueNextMonth(b.hydro_date)).length,
    dueThisYear: backplates.filter(b => isServiceDueThisYear(b.hydro_date)).length,
    spare: backplates.filter(b => b.is_spare).length
  }

  // Update the filtering logic to include sorting by role
  const filteredBackplates = backplates.filter(backplate => {
    const matchesSearch = searchTerm === '' || 
      backplate.serial_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (backplate.cylinder_serial && backplate.cylinder_serial.toLowerCase().includes(searchTerm.toLowerCase()))
    
    const baseLocation = getBaseLocation(backplate.location, backplate.is_spare);
    const matchesLocation = locationFilter === 'All Locations' || 
      baseLocation === locationFilter;

    return matchesSearch && matchesLocation
  }).sort((a, b) => {
    // First sort by base location
    const baseLocationA = getBaseLocation(a.location, a.is_spare);
    const baseLocationB = getBaseLocation(b.location, b.is_spare);
    
    if (baseLocationA !== baseLocationB) {
      // Use the locationOrder array for consistent location sorting
      const locationOrder = ['LF811', 'LF812', 'MRV811', 'RFV811', 'CFS811', 'SPARE', 'Others', 'Unassigned'];
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
    const baseLocation = getBaseLocation(backplate.location, backplate.is_spare);
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
  const locationOrder = ['LF811', 'LF812', 'MRV811', 'RFV811', 'CFS811', 'SPARE', 'Others', 'Unassigned'];
  const sortedLocations = Object.entries(groupedBackplates).sort((a, b) => {
    return locationOrder.indexOf(a[0]) - locationOrder.indexOf(b[0]);
  });

  const StationCard = ({ title, items }: { title: string, items: BaMasterList[] }) => (
    <div className="bg-white dark:bg-[#2E2521] rounded-lg shadow-md">
      <h3 className="text-xs tracking-[0.2em] uppercase font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] px-4 py-3 border-b border-gray-200 dark:border-[#FCF6EC]/20">
        {title}
      </h3>
      <div className="space-y-4 px-4 py-4">
        {items?.map((backplate, index) => {
          let roleName = getRole(backplate.location);
          if (roleName === '-') {
            if (title === 'SPARE') {
              roleName = getSpareDisplayName(backplate);
            } else if (title === 'Others') {
              roleName = backplate.location || 'Unknown';
            } else if (title === 'CFS811') {
              // Keep consistent with desktop view for CFS811
              roleName = 'CFS811';
            } else {
              roleName = backplate.location?.replace(title, '').trim() || 'Unknown';
            }
          }
          
          const hydroStatus = getHydroTestDueStatus(backplate.hydro_date);
          
          return (
            <div 
              key={backplate.id}
              className={cn(
                "relative p-4 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800",
                selectedBaId === backplate.id && "bg-gray-100 dark:bg-gray-800"
              )}
              onClick={() => handleBaSelect(backplate.id)}
            >
              {/* Edit icon */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleOpenEdit(backplate) }}
                className="absolute top-2 right-2 inline-flex items-center justify-center w-6 h-6 rounded-md border bg-white/90 dark:bg-neutral-900/70 text-neutral-700 dark:text-neutral-200 shadow-sm hover:bg-white dark:hover:bg-neutral-800"
                aria-label="Edit BA"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase">
                    {roleName}
                  </span>
                  <div className="flex items-center gap-1">
                    {hydroStatus && (
                      <div className={`flex items-center gap-1 ${getHydroStatusClass(hydroStatus)} text-[10px]`}>
                        <AlertCircle className="h-3 w-3" />
                        <span>{getHydroStatusText(hydroStatus).replace('Hydrostatic Test Due ', '')}</span>
                      </div>
                    )}
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
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em]">Hydrostatic</span>
                    <span className={`font-['Azeret_Mono'] ${hydroStatus ? getHydroStatusClass(hydroStatus) : 'text-gray-900 dark:text-[#FCF6EC]'} tracking-[0.1em] text-[10px] text-right`}>
                      {backplate.hydro_date ? new Date(backplate.hydro_date).toLocaleDateString('en-GB', {
                        year: 'numeric',
                        month: 'short'
                      }) : '-'}
                    </span>
                  </div>
                  {backplate.remarks && (
                    <div className="flex items-center justify-between text-[10px] mt-2">
                      <span className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em]">Remarks</span>
                      <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px] text-right">
                        {backplate.remarks}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // Update the tableView definition
  const tableView = (
    <Table>
      <TableHeader>
        <TableRow className="bg-gray-200 dark:bg-[#2E2521]">
          <TableHead className="w-[50px] text-sm font-medium text-gray-900 dark:text-[#FCF6EC]/70 font-['Azeret_Mono']">S/N</TableHead>
          <TableHead className="w-[140px] text-sm font-medium text-gray-900 dark:text-[#FCF6EC]/70 font-['Azeret_Mono']">Serial Number</TableHead>
          <TableHead className="w-[140px] text-sm font-medium text-gray-900 dark:text-[#FCF6EC]/70 font-['Azeret_Mono']">Cylinder S/R No.</TableHead>
          <TableHead className="w-[100px] text-sm font-medium text-gray-900 dark:text-[#FCF6EC]/70 font-['Azeret_Mono']">DOB</TableHead>
          <TableHead className="w-[110px] text-sm font-medium text-gray-900 dark:text-[#FCF6EC]/70 font-['Azeret_Mono']">Hydrostatic</TableHead>
          <TableHead className="w-[140px] text-sm font-medium text-gray-900 dark:text-[#FCF6EC]/70 font-['Azeret_Mono']">Location</TableHead>
          <TableHead className="w-[110px] text-sm font-medium text-gray-900 dark:text-[#FCF6EC]/70 font-['Azeret_Mono']">Telemetry ID</TableHead>
          <TableHead className="w-[140px] text-sm font-medium text-gray-900 dark:text-[#FCF6EC]/70 font-['Azeret_Mono']">Remarks</TableHead>
          <TableHead className="w-[70px] text-center text-sm font-medium text-gray-900 dark:text-[#FCF6EC]/70 font-['Azeret_Mono']">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filteredBackplates.map((backplate, index) => {
          const hydroStatus = getHydroTestDueStatus(backplate.hydro_date);
          return (
            <TableRow 
              key={backplate.id}
              className={cn(
                "cursor-pointer",
                "bg-white hover:bg-gray-50 dark:hover:bg-[#FCF6EC]/5",
                backplate.is_spare ? 'bg-gray-50 dark:bg-[#FCF6EC]/5' : '',
                hydroStatus ? getHydroStatusBgClass(hydroStatus) : '',
                selectedBaId === backplate.id && "bg-gray-100 dark:bg-gray-800"
              )}
              onClick={() => handleBaSelect(backplate.id)}
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
              <TableCell 
                className={`text-sm ${hydroStatus ? getHydroStatusClass(hydroStatus) : 'text-gray-700 dark:text-[#FCF6EC]/60'} font-light font-['Azeret_Mono']`}
              >
                <div className="flex flex-col">
                  <span>
                    {backplate.hydro_date ? new Date(backplate.hydro_date).toLocaleDateString('en-GB', {
                      year: 'numeric',
                      month: 'short'
                    }) : '-'}
                  </span>
                  {hydroStatus && (
                    <span className="text-[10px] mt-1">
                      {getHydroStatusText(hydroStatus).replace('Hydrostatic Test ', '')}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-sm text-gray-700 dark:text-[#FCF6EC]/60 font-light font-['Azeret_Mono']">
                {backplate.location || '-'}
              </TableCell>
              <TableCell className="text-sm text-gray-700 dark:text-[#FCF6EC]/60 font-light font-['Azeret_Mono']">
                {backplate.telemetry_id || '-'}
              </TableCell>
              <TableCell className="text-sm text-gray-700 dark:text-[#FCF6EC]/60 font-light font-['Azeret_Mono']">
                {backplate.remarks || '-'}
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
        })}
      </TableBody>
    </Table>
  );

  // Function to handle BA selection
  const handleBaSelect = (baId: number) => {
    setSelectedBaId(baId);
    setShowMovements(true);
  };

  // Function to show all movements
  const showAllMovements = () => {
    setSelectedBaId(null);
    setShowMovements(true);
  };

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
        <header className="px-4 md:px-6 pt-6 pb-4 md:pb-8 border-b border-gray-200 dark:border-[#FCF6EC]/20">
          {/* Mobile Header */}
          <div className="md:hidden space-y-4 max-w-7xl mx-auto">
            <div className="flex flex-col items-start">
              <span className="text-[8px] tracking-[0.2em] text-neutral-500 uppercase mb-1">
                SCBA INVENTORY
              </span>
              <h1 className="text-2xl tracking-tight text-neutral-900 dark:text-[#FCF6EC] uppercase">
                BA MASTER LIST
              </h1>
            </div>
          </div>

          {/* Desktop Header - unchanged */}
          <div className="hidden md:flex items-center justify-between mb-12 max-w-7xl mx-auto">
            <div className="space-y-0.5">
              <span className="text-[10px] tracking-[0.2em] text-gray-500 uppercase block">Fire Check</span>
              <h1 className="text-[32px] font-normal tracking-[-0.02em] text-gray-900 dark:text-[#FCF6EC] uppercase">BA MASTER LIST</h1>
            </div>
            <span className="text-[10px] tracking-[0.2em] text-gray-500 dark:text-[#FCF6EC]/60 uppercase">SCBA Inventory</span>
          </div>
          
          {/* Stats Overview */}
          <div className="flex flex-col mt-8 max-w-7xl mx-auto px-2">
            <div className="grid grid-cols-3 md:grid-cols-12 gap-4">
              <div className="flex flex-col col-span-1 md:col-span-4 items-start">
                <p className="text-[10px] font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 uppercase tracking-[0.2em]">TOTAL</p>
                <p className="text-[24px] md:text-[32px] font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[-0.02em]">{stats.total}</p>
              </div>
              
              <div className="flex flex-col col-span-1 md:col-span-4 items-start">
                <p className="text-[10px] font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 uppercase tracking-[0.2em]">
                  <span>IN</span>
                  <span className="md:block">SERVICE</span>
                </p>
                <p className="text-[24px] md:text-[32px] font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[-0.02em]">{stats.inService}</p>
              </div>
              
              <div className="flex flex-col col-span-1 md:col-span-4 items-start">
                <p className="text-[10px] font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 uppercase tracking-[0.2em]">SPARE</p>
                <p className="text-[24px] md:text-[32px] font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[-0.02em]">{stats.spare}</p>
              </div>
            </div>
            
            <div className="border-t border-gray-200 dark:border-[#FCF6EC]/10 mt-6 pt-6 w-full">
              <p className="text-[10px] font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/60 uppercase tracking-[0.2em] mb-2 md:mb-0 md:float-left md:mr-2">DUE</p>
              <div className="grid grid-cols-2 md:flex md:flex-row gap-3 md:gap-6">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-600"></span>
                  <span className="text-amber-600 text-[13px] md:text-[14px] font-['Azeret_Mono']">This Month: {stats.dueService}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-orange-500"></span>
                  <span className="text-orange-500 text-[13px] md:text-[14px] font-['Azeret_Mono']">Next Month: {stats.dueNextMonth}</span>
                </div>
                <div className="flex items-center gap-1.5 col-span-2 md:col-span-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-600"></span>
                  <span className="text-blue-600 text-[13px] md:text-[14px] font-['Azeret_Mono']">This Year: {stats.dueThisYear}</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="px-6 pb-6">
          {/* Search and Actions */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-6 py-4 md:py-6 max-w-7xl mx-auto">
            {/* Mobile Actions */}
            <div className="flex md:hidden items-center justify-between w-full gap-2">
              {/* Mobile Search - Conditional rendering */}
              {showMobileSearch ? (
                <div className="relative flex-1 mr-2 transition-all duration-200 ease-in-out">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <Input 
                    type="search" 
                    placeholder="Search serial number..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 h-8 text-xs bg-neutral-50 dark:bg-[#1C1917] border-0 w-full focus-visible:ring-neutral-900 rounded-md"
                    autoFocus
                  />
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => setShowMobileSearch(false)}
                    className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 bg-transparent text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => setShowMobileSearch(true)}
                  className="h-8 w-8 p-2 border-0 rounded-md inline-flex items-center justify-center bg-neutral-900 text-white shrink-0"
                >
                  <Search className="h-4 w-4" />
                </Button>
              )}

              <div className="flex items-center gap-2">
                {/* Mobile Location Filter - Icon Only Dropdown */}
                <Select value={locationFilter} onValueChange={setLocationFilter}>
                  <SelectTrigger 
                    className="h-8 w-8 p-2 border-0 rounded-md inline-flex items-center justify-center bg-neutral-900 text-white [&>svg:last-child]:hidden"
                    aria-label="Filter by location"
                  >
                    <MapPin className="h-4 w-4" />
                  </SelectTrigger>
                  {/* SelectValue removed to make it icon only */}
                  <SelectContent>
                    {locations.map(location => (
                      <SelectItem 
                        key={location} 
                        value={location} 
                        className="font-['Azeret_Mono'] text-xs tracking-wide"
                      >
                        {location}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => {
                    console.log('[Mobile View Button] Clicked! Current view:', view); // Log 1: Button click + current state
                    setView(view === 'list' ? 'grouped' : 'list');
                  }}
                  className="h-8 w-8 p-2 border-0 rounded-md inline-flex items-center justify-center bg-neutral-900 text-white"
                >
                  {view === 'list' ? (
                    <Grid className="h-4 w-4" />
                  ) : (
                    <List className="h-4 w-4" />
                  )}
                </Button>
                
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={showAllMovements}
                  className="h-8 w-8 p-2 border-0 rounded-md inline-flex items-center justify-center bg-neutral-900 text-white"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>

                <Button 
                  size="icon"
                  className="h-8 w-8 bg-neutral-900"
                >
                  <Plus className="h-4 w-4 text-white" />
                </Button>
              </div>
            </div>

            {/* Desktop Search and Filter */}
            <div className="hidden md:flex items-center gap-2 md:gap-4 w-full md:w-auto">
              <div className="relative flex-1 md:w-[480px]">
                <Search className="absolute left-2 md:left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <Input 
                  type="search" 
                  placeholder="Search by serial number..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-7 md:pl-10 h-9 text-sm bg-neutral-50 dark:bg-[#1C1917] border-0 w-full focus-visible:ring-neutral-900"
                />
              </div>

              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="w-[200px] h-9 bg-neutral-50 dark:bg-[#1C1917] border-0
                                      text-gray-900 dark:text-[#FCF6EC] text-sm font-['Azeret_Mono']
                                      focus-visible:ring-neutral-900 rounded-md">
                  <MapPin className="mr-2 h-4 w-4 text-neutral-400" />
                  <SelectValue placeholder="All Locations" />
                </SelectTrigger>
                <SelectContent>
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

              <Button
                variant="secondary"
                size="sm"
                onClick={showAllMovements}
                className="h-9"
              >
                View Movements
              </Button>
            </div>

            {/* Desktop View Toggle and Add Button */}
            <div className="hidden md:flex items-center gap-4">
              <Button
                variant="outline"
                size="icon" 
                onClick={() => setView(view === 'list' ? 'grouped' : 'list')}
                className="h-9 w-9"
              >
                {view === 'list' ? (
                  <Grid className="h-4 w-4" />
                ) : (
                  <List className="h-4 w-4" />
                )}
              </Button>

              <Button
                className="bg-neutral-900 hover:bg-neutral-800 h-9 px-3"
              >
                <Plus className="h-4 w-4 mr-2" /> Add Cylinder
              </Button>
            </div>
          </div>

          {/* Border separator */}
          <div className="border-b border-gray-200 dark:border-[#FCF6EC]/20"></div>

          {/* Content */}
          <div className="py-6 max-w-7xl mx-auto">
          {view === 'list' ? (
              <div className="bg-gray-200 dark:bg-[#2E2521] rounded-md overflow-hidden border border-gray-200 dark:border-[#FCF6EC]/20">
                <div className="overflow-x-auto">
                  {tableView}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {locationFilter === 'All Locations' ? (
                  <div className="space-y-6">
                    {/* Mobile View - Single Column */}
                    <div className="md:hidden space-y-6">
                      {sortedLocations.map(([location, items]) => (
                        <StationCard key={location} title={location} items={items} />
                      ))}
                    </div>

                    {/* Desktop View - Original Layout */}
                    <div className="hidden md:block">
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
                                  <div className="flex items-center gap-2">
                                    {(() => {
                                      const hydroDate = (groupedBackplates['LF811'] || []).find(b => getRole(b.location) === role)?.hydro_date ?? null;
                                      const hydroStatus = getHydroTestDueStatus(hydroDate);
                                      if (!hydroStatus) return null;
                                      return (
                                        <div className={`flex items-center gap-1 ${getHydroStatusClass(hydroStatus)} text-[10px]`}>
                                          <AlertCircle className="h-3 w-3" />
                                          <span>{getHydroStatusText(hydroStatus).replace('Hydrostatic Test Due ', '')}</span>
                                        </div>
                                      );
                                    })()}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const backplate = (groupedBackplates['LF811'] || []).find(b => getRole(b.location) === role);
                                        if (backplate) handleOpenEdit(backplate);
                                      }}
                                      className="inline-flex items-center justify-center w-6 h-6 rounded-md border bg-white/90 dark:bg-neutral-900/70 text-neutral-700 dark:text-neutral-200 shadow-sm hover:bg-white dark:hover:bg-neutral-800"
                                      aria-label="Edit BA"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-y-2">
                                  <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                    Backplate
                                  </div>
                                  <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px] text-right">
                                    {(groupedBackplates['LF811'] || []).find(b => getRole(b.location) === role)?.serial_number || '-'}
                                  </div>
                                  <div className="font-['Azeret_Mono'] text-gray-500 dark:text-[#FCF6EC]/50 uppercase tracking-[0.15em] text-[10px]">
                                    Cylinder
                                  </div>
                                  <div className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] tracking-[0.1em] text-[10px] text-right">
                                    {(groupedBackplates['LF811'] || []).find(b => getRole(b.location) === role)?.cylinder_serial || '-'}
                                  </div>
                                </div>
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
                                  <div className="flex items-center gap-2">
                                    {(() => {
                                      const hydroDate = (groupedBackplates['LF812'] || []).find(b => b.location?.includes(role))?.hydro_date ?? null;
                                      const hydroStatus = getHydroTestDueStatus(hydroDate);
                                      if (!hydroStatus) return null;
                                      return (
                                        <div className={`flex items-center gap-1 ${getHydroStatusClass(hydroStatus)} text-[10px]`}>
                                          <AlertCircle className="h-3 w-3" />
                                          <span>{getHydroStatusText(hydroStatus).replace('Hydrostatic Test Due ', '')}</span>
                                        </div>
                                      );
                                    })()}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const backplate = (groupedBackplates['LF812'] || []).find(b => b.location?.includes(role));
                                        if (backplate) handleOpenEdit(backplate);
                                      }}
                                      className="inline-flex items-center justify-center w-6 h-6 rounded-md border bg-white/90 dark:bg-neutral-900/70 text-neutral-700 dark:text-neutral-200 shadow-sm hover:bg-white dark:hover:bg-neutral-800"
                                      aria-label="Edit BA"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  </div>
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
                                  <div className="flex items-center gap-2">
                                    {(() => {
                                      const hydroStatus = getHydroTestDueStatus(backplate.hydro_date);
                                      if (!hydroStatus) return null;
                                      return (
                                        <div className={`flex items-center gap-1 ${getHydroStatusClass(hydroStatus)} text-[10px]`}>
                                          <AlertCircle className="h-3 w-3" />
                                          <span>{getHydroStatusText(hydroStatus).replace('Hydrostatic Test Due ', '')}</span>
                                        </div>
                                      );
                                    })()}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenEdit(backplate);
                                      }}
                                      className="inline-flex items-center justify-center w-6 h-6 rounded-md border bg-white/90 dark:bg-neutral-900/70 text-neutral-700 dark:text-neutral-200 shadow-sm hover:bg-white dark:hover:bg-neutral-800"
                                      aria-label="Edit BA"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                                <div className="space-y-2">
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
                                    <div className="flex items-center gap-2">
                                      {(() => {
                                        const hydroDate = (groupedBackplates['MRV811'] || []).find(b => getRole(b.location) === setNumber)?.hydro_date ?? null;
                                        const hydroStatus = getHydroTestDueStatus(hydroDate);
                                        if (!hydroStatus) return null;
                                        return (
                                          <div className={`flex items-center gap-1 ${getHydroStatusClass(hydroStatus)} text-[10px]`}>
                                            <AlertCircle className="h-3 w-3" />
                                            <span>{getHydroStatusText(hydroStatus).replace('Hydrostatic Test Due ', '')}</span>
                                          </div>
                                        );
                                      })()}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const backplate = (groupedBackplates['MRV811'] || []).find(b => getRole(b.location) === setNumber);
                                          if (backplate) handleOpenEdit(backplate);
                                        }}
                                        className="inline-flex items-center justify-center w-6 h-6 rounded-md border bg-white/90 dark:bg-neutral-900/70 text-neutral-700 dark:text-neutral-200 shadow-sm hover:bg-white dark:hover:bg-neutral-800"
                                        aria-label="Edit BA"
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </button>
                                    </div>
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
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Third Row: Others and SPARE */}
                      <div className="mt-6 grid grid-cols-2 gap-6">
                        {/* CFS811 and Others */}
                        <div className="bg-gray-200 dark:bg-[#2E2521] rounded-md overflow-hidden border border-gray-200 dark:border-[#FCF6EC]/20">
                          <h3 className="text-xs tracking-[0.2em] uppercase font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] px-4 py-3 border-b border-gray-200 dark:border-[#FCF6EC]/20 bg-white">
                            Others
                          </h3>
                          <div className="p-4 space-y-6">
                            {/* CFS811 Items */}
                            {(groupedBackplates['CFS811'] || []).length > 0 && (
                              <div>
                                <h4 className="text-xs tracking-[0.15em] uppercase font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] bg-gray-100 dark:bg-[#2E2521]/50 p-2 mb-3 rounded-sm">
                                  CFS811
                                </h4>
                                <div className="space-y-4">
                                  {(groupedBackplates['CFS811'] || []).map((backplate) => {
                                    const roleName = getRole(backplate.location) !== '-' ? 
                                      getRole(backplate.location) : 
                                      backplate.location || 'Unknown';
                                    
                                    return (
                                      <div key={backplate.id} className="p-3 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-sm bg-white dark:bg-[#2E2521]/80 shadow-sm">
                                        <div className="flex items-center justify-between mb-2">
                                          <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase">
                                            {roleName}
                                          </span>
                                          <div className="flex items-center gap-2">
                                            {(() => {
                                              const hydroStatus = getHydroTestDueStatus(backplate.hydro_date);
                                              if (!hydroStatus) return null;
                                              return (
                                                <div className={`flex items-center gap-1 ${getHydroStatusClass(hydroStatus)} text-[10px]`}>
                                                  <AlertCircle className="h-3 w-3" />
                                                  <span>{getHydroStatusText(hydroStatus).replace('Hydrostatic Test Due ', '')}</span>
                                                </div>
                                              );
                                            })()}
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleOpenEdit(backplate);
                                              }}
                                              className="inline-flex items-center justify-center w-6 h-6 rounded-md border bg-white/90 dark:bg-neutral-900/70 text-neutral-700 dark:text-neutral-200 shadow-sm hover:bg-white dark:hover:bg-neutral-800"
                                              aria-label="Edit BA"
                                            >
                                              <Pencil className="h-3 w-3" />
                                            </button>
                                          </div>
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
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            
                            {/* Others Items */}
                            {(groupedBackplates['Others'] || []).length > 0 && (
                              <div>
                                <h4 className="text-xs tracking-[0.15em] uppercase font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] bg-gray-100 dark:bg-[#2E2521]/50 p-2 mb-3 rounded-sm">
                                  Other Locations
                                </h4>
                                <div className="space-y-4">
                                  {(groupedBackplates['Others'] || []).map((backplate) => {
                                    const roleName = getRole(backplate.location) !== '-' ? 
                                      getRole(backplate.location) : 
                                      backplate.location || 'Unknown';
                                    
                                    return (
                                      <div key={backplate.id} className="p-3 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-sm bg-white dark:bg-[#2E2521]/80 shadow-sm">
                                        <div className="flex items-center justify-between mb-2">
                                          <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase">
                                            {roleName}
                                          </span>
                                          <div className="flex items-center gap-2">
                                            {(() => {
                                              const hydroStatus = getHydroTestDueStatus(backplate.hydro_date);
                                              if (!hydroStatus) return null;
                                              return (
                                                <div className={`flex items-center gap-1 ${getHydroStatusClass(hydroStatus)} text-[10px]`}>
                                                  <AlertCircle className="h-3 w-3" />
                                                  <span>{getHydroStatusText(hydroStatus).replace('Hydrostatic Test Due ', '')}</span>
                                                </div>
                                              );
                                            })()}
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleOpenEdit(backplate);
                                              }}
                                              className="inline-flex items-center justify-center w-6 h-6 rounded-md border bg-white/90 dark:bg-neutral-900/70 text-neutral-700 dark:text-neutral-200 shadow-sm hover:bg-white dark:hover:bg-neutral-800"
                                              aria-label="Edit BA"
                                            >
                                              <Pencil className="h-3 w-3" />
                                            </button>
                                          </div>
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
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* SPARE */}
                        <div className="bg-gray-200 dark:bg-[#2E2521] rounded-md overflow-hidden border border-gray-200 dark:border-[#FCF6EC]/20">
                          <h3 className="text-xs tracking-[0.2em] uppercase font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] px-4 py-3 border-b border-gray-200 dark:border-[#FCF6EC]/20 bg-white">
                            SPARE
                          </h3>
                          <div className="p-4 space-y-4">
                            {(groupedBackplates['SPARE'] || []).map((backplate, index) => (
                              <div 
                          key={backplate.id}
                                className="p-3 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-sm bg-white dark:bg-[#2E2521]/80 shadow-sm"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase">
                                    {getRole(backplate.location) !== '-' ? getRole(backplate.location) : getSpareDisplayName(backplate)}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {(() => {
                                      const hydroStatus = getHydroTestDueStatus(backplate.hydro_date);
                                      if (!hydroStatus) return null;
                                      return (
                                        <div className={`flex items-center gap-1 ${getHydroStatusClass(hydroStatus)} text-[10px]`}>
                                          <AlertCircle className="h-3 w-3" />
                                          <span>{getHydroStatusText(hydroStatus).replace('Hydrostatic Test Due ', '')}</span>
                                        </div>
                                      );
                                    })()}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenEdit(backplate);
                                      }}
                                      className="inline-flex items-center justify-center w-6 h-6 rounded-md border bg-white/90 dark:bg-neutral-900/70 text-neutral-700 dark:text-neutral-200 shadow-sm hover:bg-white dark:hover:bg-neutral-800"
                                      aria-label="Edit BA"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  </div>
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
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Mobile View - Single Column */}
                    <div className="md:hidden">
                      <StationCard title={locationFilter} items={groupedBackplates[locationFilter] || []} />
                    </div>

                    {/* Desktop View - Grid Layout */}
                    <div className="hidden md:block">
                      <div className="bg-gray-200 dark:bg-[#2E2521] rounded-md overflow-hidden border border-gray-200 dark:border-[#FCF6EC]/20">
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
                                      {(() => {
                                        const hydroDate = (groupedBackplates[locationFilter] || []).find(b => getRole(b.location) === setNumber)?.hydro_date ?? null;
                                        const hydroStatus = getHydroTestDueStatus(hydroDate);
                                        if (!hydroStatus) return null;
                                        return (
                                          <div className={`flex items-center gap-1 ${getHydroStatusClass(hydroStatus)} text-[10px]`}>
                                            <AlertCircle className="h-3 w-3" />
                                            <span>{getHydroStatusText(hydroStatus).replace('Hydrostatic Test Due ', '')}</span>
                                          </div>
                                        );
                                      })()}
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
                                    {(() => {
                                      const hydroDate = (groupedBackplates[locationFilter] || []).find(b => getRole(b.location) === setNumber)?.hydro_date ?? null;
                                      const hydroStatus = getHydroTestDueStatus(hydroDate);
                                      if (!hydroStatus) return null;
                                      return (
                                        <div className={`flex items-center gap-1 ${getHydroStatusClass(hydroStatus)} text-[10px]`}>
                                          <AlertCircle className="h-3 w-3" />
                                          <span>{getHydroStatusText(hydroStatus).replace('Hydrostatic Test Due ', '')}</span>
                                        </div>
                                      );
                                    })()}
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
                                </div>
                              ))
                            )
                          ) : locationFilter === 'SPARE' ? (
                            // For SPARE, just list all spare backplates
                            (groupedBackplates[locationFilter] || []).map((backplate, index) => (
                              <div 
                          key={backplate.id}
                                className="p-3 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-sm bg-white dark:bg-[#2E2521]/80 shadow-sm"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase">
                                    {getRole(backplate.location) !== '-' ? getRole(backplate.location) : getSpareDisplayName(backplate)}
                                  </span>
                                  {isServiceDueThisMonth(backplate.hydro_date) && (
                                    <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-[10px]">
                                      <AlertCircle className="h-3 w-3" />
                                      <span>Hydrostatic Test Due</span>
                                    </div>
                                  )}
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
                              </div>
                            ))
                          ) : locationFilter === 'Others' ? (
                            // For Others, use the actual role from the location
                            (groupedBackplates[locationFilter] || []).map((backplate) => (
                              <div key={backplate.id} className="p-3 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-sm bg-white dark:bg-[#2E2521]/80 shadow-sm">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase">
                                    {getRole(backplate.location) !== '-' ? getRole(backplate.location) : backplate.location || 'Unknown'}
                                  </span>
                                  {isServiceDueThisMonth(backplate.hydro_date) && (
                                    <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-[10px]">
                                      <AlertCircle className="h-3 w-3" />
                                      <span>Hydrostatic Test Due</span>
                                    </div>
                                  )}
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
                              </div>
                            ))
                          ) : locationFilter === 'CFS811' ? (
                            // For CFS811 items
                            (groupedBackplates[locationFilter] || []).map((backplate) => (
                              <div key={backplate.id} className="p-3 border border-gray-200 dark:border-[#FCF6EC]/10 rounded-sm bg-white dark:bg-[#2E2521]/80 shadow-sm">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-['Azeret_Mono'] text-gray-900 dark:text-[#FCF6EC] text-xs tracking-[0.15em] uppercase">
                                    CFS811
                                  </span>
                                  {isServiceDueThisMonth(backplate.hydro_date) && (
                                    <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-[10px]">
                                      <AlertCircle className="h-3 w-3" />
                                      <span>Hydrostatic Test Due</span>
                                    </div>
                                  )}
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
                                  {isServiceDueThisMonth((groupedBackplates[locationFilter] || []).find(b => getRole(b.location) === role)?.hydro_date ?? null) && (
                                    <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-[10px]">
                                      <AlertCircle className="h-3 w-3" />
                                      <span>Hydrostatic Test Due</span>
                                    </div>
                                  )}
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
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>
      </main>
      
      {/* Replace the bottom BAMovementsTable with a Dialog */}
      {showMovements && (
        <Dialog open={showMovements} onOpenChange={setShowMovements}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Movement History</DialogTitle>
            </DialogHeader>
            <BAMovementsTable 
              baList={backplates} 
              selectedBaId={selectedBaId}
              showAllMovements={true}
              swapType={swapType}
              onValidate={() => setShowValidation(true)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Dialog - All Fields */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Edit BA Details
              {Object.keys(baForm).some(key => isFieldChanged(key as keyof typeof baForm)) && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 rounded-full">
                  <span className="w-1.5 h-1.5 bg-orange-500 rounded-full"></span>
                  Changes Made
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="serial_number" className="text-xs">Backplate Serial Number</Label>
                
                <div className="relative" ref={backplateDropdownRef}>
                  <Button
                    variant="outline"
                    onClick={() => setBackplateDropdownOpen(!backplateDropdownOpen)}
                    className={cn("mt-1 h-8 w-full justify-between text-sm", getFieldHighlightClass('serial_number'))}
                  >
                    {baForm.serial_number || "Select backplate..."}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                  
                  {backplateDropdownOpen && (
                    <div className="absolute top-full left-0 z-50 mt-1 w-[90vw] max-w-md bg-white border border-gray-200 rounded-md shadow-lg">
                      <div className="grid grid-cols-2 divide-x min-h-48">
                        {/* Left column - Locations */}
                        <div className="p-2">
                          <div className="text-xs font-semibold text-gray-500 mb-2 px-2">LOCATIONS</div>
                          <div className="space-y-1">
                            {/* Current item */}
                            {editBa?.serial_number && (
                              <button
                                className="w-full text-left px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                                onClick={() => {
                                  handleBackplateDropdownSelection(editBa.serial_number!)
                                }}
                              >
                                Current
                              </button>
                            )}
                            {/* Create new */}
                            <button
                              className="w-full text-left px-2 py-1 text-xs text-green-600 rounded hover:bg-green-50"
                              onClick={() => {
                                handleBackplateDropdownSelection('CREATE_NEW')
                              }}
                            >
                              + Create New
                            </button>
                            {/* Location buttons */}
                            {Object.keys(getBackplatesByLocation()).map(location => (
                              <button
                                key={location}
                                className={cn(
                                  "w-full text-left px-2 py-1 text-xs rounded hover:bg-gray-100",
                                  selectedBackplateLocation === location ? "bg-gray-100" : ""
                                )}
                                onClick={() => setSelectedBackplateLocation(selectedBackplateLocation === location ? '' : location)}
                              >
                                📍 {location}
                              </button>
                            ))}
                          </div>
                        </div>
                        
                        {/* Right column - Serial Numbers */}
                        <div className="p-2">
                          <div className="text-xs font-semibold text-gray-500 mb-2 px-2">
                            {selectedBackplateLocation ? selectedBackplateLocation.toUpperCase() : 'SELECT LOCATION'}
                          </div>
                          <div className="space-y-1">
                            {selectedBackplateLocation && getBackplatesByLocation()[selectedBackplateLocation]?.map(backplate => (
                              <button
                                key={backplate.id}
                                className="w-full text-left px-2 py-1 text-xs rounded hover:bg-gray-100"
                                onClick={() => {
                                  handleBackplateDropdownSelection(backplate.serial_number!)
                                }}
                              >
                                {backplate.serial_number}
                                <div className="text-[10px] text-gray-500">{backplate.location}</div>
                              </button>
                            ))}
                            {!selectedBackplateLocation && (
                              <div className="px-2 py-4 text-xs text-gray-400 text-center">
                                Select a location to see available backplates
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                {isCreatingNew.backplate && (
                  <Input
                    value={baForm.serial_number}
                    onChange={(e) => handleFormChange('serial_number', e.target.value)}
                    className={cn("mt-2 h-8 text-sm", getFieldHighlightClass('serial_number'))}
                    placeholder="Enter new backplate serial"
                  />
                )}
              </div>
              
              <div>
                <Label htmlFor="cylinder_serial" className="text-xs">Cylinder Serial Number</Label>
                
                <div className="relative" ref={cylinderDropdownRef}>
                  <Button
                    variant="outline"
                    onClick={() => setCylinderDropdownOpen(!cylinderDropdownOpen)}
                    className={cn("mt-1 h-8 w-full justify-between text-sm", getFieldHighlightClass('cylinder_serial'))}
                  >
                    {baForm.cylinder_serial || "Select cylinder..."}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                  
                  {cylinderDropdownOpen && (
                    <div className="absolute top-full right-0 z-50 mt-1 w-[90vw] max-w-md bg-white border border-gray-200 rounded-md shadow-lg">
                      <div className="grid grid-cols-2 divide-x min-h-48">
                        {/* Left column - Locations */}
                        <div className="p-2">
                          <div className="text-xs font-semibold text-gray-500 mb-2 px-2">LOCATIONS</div>
                          <div className="space-y-1">
                            {/* Current item */}
                            {editBa?.cylinder_serial && (
                              <button
                                className="w-full text-left px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                                onClick={() => {
                                  handleCylinderDropdownSelection(editBa.cylinder_serial!)
                                }}
                              >
                                Current
                              </button>
                            )}
                            {/* Create new */}
                            <button
                              className="w-full text-left px-2 py-1 text-xs text-green-600 rounded hover:bg-green-50"
                              onClick={() => {
                                handleCylinderDropdownSelection('CREATE_NEW')
                              }}
                            >
                              + Create New
                            </button>
                            {/* Location buttons */}
                            {Object.keys(getCylindersByLocation()).map(location => (
                              <button
                                key={location}
                                className={cn(
                                  "w-full text-left px-2 py-1 text-xs rounded hover:bg-gray-100",
                                  selectedCylinderLocation === location ? "bg-gray-100" : ""
                                )}
                                onClick={() => setSelectedCylinderLocation(selectedCylinderLocation === location ? '' : location)}
                              >
                                📍 {location}
                              </button>
                            ))}
                          </div>
                        </div>
                        
                        {/* Right column - Serial Numbers */}
                        <div className="p-2">
                          <div className="text-xs font-semibold text-gray-500 mb-2 px-2">
                            {selectedCylinderLocation ? selectedCylinderLocation.toUpperCase() : 'SELECT LOCATION'}
                          </div>
                          <div className="space-y-1">
                            {selectedCylinderLocation && getCylindersByLocation()[selectedCylinderLocation]?.map(cylinder => (
                              <button
                                key={cylinder.id}
                                className="w-full text-left px-2 py-1 text-xs rounded hover:bg-gray-100"
                                onClick={() => {
                                  handleCylinderDropdownSelection(cylinder.cylinder_serial!)
                                }}
                              >
                                {cylinder.cylinder_serial}
                                <div className="text-[10px] text-gray-500">{cylinder.location}</div>
                              </button>
                            ))}
                            {!selectedCylinderLocation && (
                              <div className="px-2 py-4 text-xs text-gray-400 text-center">
                                Select a location to see available cylinders
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                {isCreatingNew.cylinder && (
                  <Input
                    value={baForm.cylinder_serial}
                    onChange={(e) => handleFormChange('cylinder_serial', e.target.value)}
                    className={cn("mt-2 h-8 text-sm", getFieldHighlightClass('cylinder_serial'))}
                    placeholder="Enter new cylinder serial"
                  />
                )}
              </div>
            </div>
            


            {/* Editable fields - always available */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="date_of_birth" className="text-xs">Date of Birth</Label>
                <Input
                  id="date_of_birth"
                  type="date"
                  value={baForm.date_of_birth}
                  onChange={(e) => handleFormChange('date_of_birth', e.target.value)}
                  onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker && (e.currentTarget as any).showPicker()}
                  onKeyDown={(e) => { if (e.key === 'Enter') { const t = e.currentTarget as HTMLInputElement; (t as any).showPicker && (t as any).showPicker(); } }}
                  autoComplete="off"
                  className={cn("mt-1 h-8 text-sm", getFieldHighlightClass('date_of_birth'))}
                />
              </div>
              <div>
                <Label htmlFor="hydro_date" className="text-xs">Hydrostatic Date</Label>
                <Input
                  id="hydro_date"
                  type="date"
                  value={baForm.hydro_date}
                  onChange={(e) => handleFormChange('hydro_date', e.target.value)}
                  onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker && (e.currentTarget as any).showPicker()}
                  onKeyDown={(e) => { if (e.key === 'Enter') { const t = e.currentTarget as HTMLInputElement; (t as any).showPicker && (t as any).showPicker(); } }}
                  autoComplete="off"
                  className={cn("mt-1 h-8 text-sm", getFieldHighlightClass('hydro_date'))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="service_due_date" className="text-xs">Service Due Date</Label>
                <Input
                  id="service_due_date"
                  type="date"
                  value={baForm.service_due_date}
                  onChange={(e) => handleFormChange('service_due_date', e.target.value)}
                  onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker && (e.currentTarget as any).showPicker()}
                  onKeyDown={(e) => { if (e.key === 'Enter') { const t = e.currentTarget as HTMLInputElement; (t as any).showPicker && (t as any).showPicker(); } }}
                  autoComplete="off"
                  className={cn("mt-1 h-8 text-sm", getFieldHighlightClass('service_due_date'))}
                />
              </div>
              <div>
                <Label htmlFor="telemetry_id" className="text-xs">Telemetry ID</Label>
                <Input
                  id="telemetry_id"
                  value={baForm.telemetry_id}
                  onChange={(e) => handleFormChange('telemetry_id', e.target.value)}
                  className={cn("mt-1 h-8 text-sm", getFieldHighlightClass('telemetry_id'))}
                  placeholder="e.g., TEL123"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="location" className="text-xs">Location</Label>
              <div className="relative" ref={locationDropdownRef}>
                <Button
                  variant="outline"
                  onClick={() => setLocationDropdownOpen(!locationDropdownOpen)}
                  className={cn("mt-1 h-8 w-full justify-between text-sm", getFieldHighlightClass('location'))}
                >
                  {baForm.location || "Select location..."}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
                
                {locationDropdownOpen && (
                  <div className="absolute top-full left-0 z-50 mt-1 w-[90vw] max-w-md bg-white border border-gray-200 rounded-md shadow-lg">
                    <div className="grid grid-cols-2 divide-x min-h-48">
                      {/* Left column - Stations */}
                      <div className="p-2">
                        <div className="space-y-1">
                          {['LF811', 'LF812', 'MRV811', 'RFV811', 'CFS811', 'SPARE'].map(station => (
                            <button
                              key={station}
                              className={cn(
                                "w-full text-left px-2 py-1 text-xs rounded hover:bg-gray-100",
                                selectedLocationStation === station ? "bg-gray-100" : ""
                              )}
                              onClick={() => setSelectedLocationStation(selectedLocationStation === station ? '' : station)}
                            >
                              🚒 {station}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      {/* Right column - Roles/Sets */}
                      <div className="p-2">
                        <div className="text-xs font-semibold text-gray-500 mb-2 px-2">
                          {selectedLocationStation ? selectedLocationStation.toUpperCase() : 'SELECT LOCATION'}
                        </div>
                        <div className="space-y-1">
                          {selectedLocationStation === 'LF811' && ['SC', 'PO', 'FF1', 'FF2'].map(role => (
                            <button
                              key={role}
                              className="w-full text-left px-2 py-1 text-xs rounded hover:bg-gray-100"
                              onClick={() => {
                                handleFormChange('location', `${selectedLocationStation} - ${role}`)
                                setLocationDropdownOpen(false)
                              }}
                            >
                              {role}
                            </button>
                          ))}
                          {selectedLocationStation === 'LF812' && ['SC', 'PO', 'FF1', 'FF2'].map(role => (
                            <button
                              key={role}
                              className="w-full text-left px-2 py-1 text-xs rounded hover:bg-gray-100"
                              onClick={() => {
                                handleFormChange('location', `${selectedLocationStation} - ${role}`)
                                setLocationDropdownOpen(false)
                              }}
                            >
                              {role}
                            </button>
                          ))}
                          {selectedLocationStation === 'MRV811' && Array.from({length: 12}, (_, i) => `Set ${i + 1}`).map(set => (
                            <button
                              key={set}
                              className="w-full text-left px-2 py-1 text-xs rounded hover:bg-gray-100"
                              onClick={() => {
                                handleFormChange('location', `${selectedLocationStation} - ${set}`)
                                setLocationDropdownOpen(false)
                              }}
                            >
                              {set}
                            </button>
                          ))}
                          {selectedLocationStation === 'RFV811' && Array.from({length: 4}, (_, i) => `Set ${i + 1}`).map(set => (
                            <button
                              key={set}
                              className="w-full text-left px-2 py-1 text-xs rounded hover:bg-gray-100"
                              onClick={() => {
                                handleFormChange('location', `${selectedLocationStation} - ${set}`)
                                setLocationDropdownOpen(false)
                              }}
                            >
                              {set}
                            </button>
                          ))}
                          {selectedLocationStation === 'CFS811' && (
                            <button
                              className="w-full text-left px-2 py-1 text-xs rounded hover:bg-gray-100"
                              onClick={() => {
                                handleFormChange('location', 'CFS811')
                                setLocationDropdownOpen(false)
                              }}
                            >
                              CFS811
                            </button>
                          )}
                          {selectedLocationStation === 'SPARE' && (
                            <button
                              className="w-full text-left px-2 py-1 text-xs rounded hover:bg-gray-100"
                              onClick={() => {
                                handleFormChange('location', 'SPARE')
                                setLocationDropdownOpen(false)
                              }}
                            >
                              SPARE
                            </button>
                          )}
                          {!selectedLocationStation && (
                            <div className="px-2 py-4 text-xs text-gray-400 text-center">
                              Select a station to see available positions
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="remarks" className="text-xs">Remarks</Label>
              <Textarea
                id="remarks"
                value={baForm.remarks}
                onChange={(e) => handleFormChange('remarks', e.target.value)}
                className={cn("mt-1 h-20 text-sm", getFieldHighlightClass('remarks'))}
                placeholder="Notes, condition, etc."
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_spare"
                checked={baForm.is_spare}
                onCheckedChange={(v) => handleFormChange('is_spare', Boolean(v))}
              />
              <Label htmlFor="is_spare" className="text-sm">Mark as SPARE</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)} className="h-8">Cancel</Button>
            <Button onClick={handleSaveBa} disabled={isSavingBa} className="h-8">
              {isSavingBa ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add this at the bottom of the component */}
      <BAValidationPanel
        baList={backplates}
        isOpen={showValidation}
        onClose={() => setShowValidation(false)}
      />
    </div>
  </div>
);
}

