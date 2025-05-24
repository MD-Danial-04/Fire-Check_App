'use client'

import { useState, useEffect } from 'react'
import { getBAMovements, createBAMovement, updateBAMovement } from '@/lib/queries'
import type { BaMovements, BaMasterList } from '@/types/database'
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Textarea } from "./ui/textarea"
import { format } from 'date-fns'
import { Plus } from 'lucide-react'
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/use-toast"

interface Props {
  baList: BaMasterList[];
  selectedBaId?: number | null;
  showAllMovements?: boolean;
  swapType?: 'BA' | 'CYLINDER';
  onValidate?: () => void;
}

export default function BAMovementsTable({
  baList,
  selectedBaId,
  showAllMovements = false,
  swapType: parentSwapType,
  onValidate,
}: Props) {
  const [movements, setMovements] = useState<BaMovements[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState<string>('')
  const [swapType, setSwapType] = useState<'BA' | 'CYLINDER'>(parentSwapType || 'BA')
  const [newMovement, setNewMovement] = useState<Partial<BaMovements>>({
    ba_id: selectedBaId || undefined,
    movement_type: 'TRANSFER',
    status: 'PENDING'
  })
  const [serialNumberError, setSerialNumberError] = useState<string | null>(null)

  // Group BAs by section
  const sectionGroups = baList.reduce((groups, ba) => {
    // Extract the base location from the full location
    const location = ba.location || 'Unassigned';
    const baseLocation = location.match(/^(LF811|LF812|MRV811|RFV811|CFS811)/i)?.[0] || 
                        (ba.is_spare ? 'SPARE' : 'Other');
    
    if (!groups[baseLocation]) {
      groups[baseLocation] = [];
    }
    groups[baseLocation].push(ba);
    return groups;
  }, {} as Record<string, BaMasterList[]>);
  
  // Get sorted section names 
  const sections = Object.keys(sectionGroups).sort((a, b) => {
    const order = ['LF811', 'LF812', 'MRV811', 'RFV811', 'CFS811', 'SPARE', 'Other', 'Unassigned'];
    return order.indexOf(a) - order.indexOf(b);
  });

  // Get filtered BAs based on selected location and swap type
  const filteredBAs = selectedLocation ? 
    sectionGroups[selectedLocation]?.filter(ba => {
      if (swapType === 'BA') {
        return ba.serial_number && ba.serial_number.trim() !== '';
      } else { // CYLINDER
        return ba.cylinder_serial && ba.cylinder_serial.trim() !== '';
      }
    }) || [] : [];

  // Reset BA selection when location changes
  useEffect(() => {
    if (selectedLocation && newMovement.ba_id) {
      // Check if current BA belongs to selected location
      const ba = baList.find(b => b.id === newMovement.ba_id);
      const baSection = ba?.location?.match(/^(LF811|LF812|MRV811|RFV811|CFS811)/i)?.[0] || 
                        (ba?.is_spare ? 'SPARE' : 'Other');
      
      // Update from_location to match selected location
      setNewMovement({ 
        ...newMovement, 
        from_location: selectedLocation,
        ba_id: baSection !== selectedLocation ? undefined : newMovement.ba_id 
      });
    }
  }, [selectedLocation]);

  // Check serial number format when it changes
  useEffect(() => {
    // Reset error when empty (we already show the Required indicator)
    if (!newMovement.to_location) {
      setSerialNumberError(null);
      return;
    }
    
    // Basic validation - serial numbers should be alphanumeric and at least 4 characters
    const isValid = /^[a-zA-Z0-9-]{4,}$/.test(newMovement.to_location);
    if (!isValid) {
      setSerialNumberError('Serial number should be at least 4 alphanumeric characters');
    } else {
      setSerialNumberError(null);
    }
  }, [newMovement.to_location]);

  // Update local swapType when parent swapType changes
  useEffect(() => {
    if (parentSwapType) {
      setSwapType(parentSwapType);
    }
  }, [parentSwapType]);

  useEffect(() => {
    fetchMovements()
  }, [selectedBaId, showAllMovements])

  const fetchMovements = async () => {
    try {
      setIsLoading(true)
      // Only filter by BA ID if we are not showing all movements and have a selected BA ID
      const data = await getBAMovements(showAllMovements ? undefined : (selectedBaId || undefined))
      setMovements(data)
    } catch (error) {
      console.error('Error fetching movements:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const resetNewMovementForm = () => {
    setNewMovement({
      ba_id: selectedBaId || undefined,
      movement_type: 'TRANSFER',
      status: 'PENDING'
    });
    setSelectedLocation('');
    setSwapType('BA');
  }

  const handleCreateMovement = async () => {
    try {
      // Validate required fields
      if (!newMovement.ba_id || !selectedLocation || !newMovement.to_location) {
        console.error('Missing required fields for movement creation');
        return;
      }
      
      // Set submitting state
      setIsSubmitting(true);
      
      // Create the movement record
      await createBAMovement({
        ba_id: newMovement.ba_id,
        from_location: selectedLocation,
        to_location: newMovement.to_location,
        movement_date: new Date().toISOString(),
        movement_type: "TRANSFER", // Using TRANSFER for swaps
        status: "PENDING", // Always start as PENDING
        remarks: `${swapType} Swap: ${newMovement.remarks || ''}`.trim(),
        created_by: null // Will be set by RLS policy
      });

      // Show success message
      toast({
        title: "Movement Created",
        description: `Successfully created a ${swapType.toLowerCase()} swap movement.`,
      });

      // Close dialog and reset form
      setIsDialogOpen(false);
      resetNewMovementForm();
      fetchMovements();
    } catch (error) {
      console.error('Error creating movement:', error);
      // Show error message
      toast({
        title: "Error",
        description: "Failed to create movement. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleUpdateStatus = async (id: string, status: BaMovements['status']) => {
    try {
      await updateBAMovement(id, { status })
      fetchMovements()
    } catch (error) {
      console.error('Error updating movement:', error)
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center p-4">Loading...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        {/* Validate BA List button */}
        {onValidate && (
          <Button variant="default" onClick={onValidate} className="min-w-[110px] h-9 px-2 text-xs">
            Validate BA List
          </Button>
        )}
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetNewMovementForm();
        }}>
          <DialogTrigger asChild>
            <Button className="min-w-[110px] h-9 px-2 text-xs">
              <Plus className="h-4 w-4 mr-2" />
              New Movement
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[95vw] max-w-md md:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-lg text-gray-900 dark:text-white font-semibold">New Movement</DialogTitle>
              <DialogDescription className="text-sm text-gray-500 dark:text-gray-400">
                Record a new BA movement. Fill in all required fields.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Location</label>
                  {!selectedLocation && <span className="text-xs text-red-500">Required</span>}
                </div>
                <Select
                  value={selectedLocation}
                  onValueChange={(val) => {
                    setSelectedLocation(val);
                    setNewMovement({
                      ...newMovement,
                      from_location: val
                    });
                  }}
                >
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue placeholder="Select Location" />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map((section) => (
                      <SelectItem key={section} value={section} className="text-sm">
                        {section}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Swap Type</label>
                <div className="flex space-x-2">
                  <Button
                    type="button"
                    variant={swapType === 'BA' ? "default" : "outline"}
                    onClick={() => setSwapType('BA')}
                    className="flex-1 h-10 text-sm"
                  >
                    Backplate
                  </Button>
                  <Button
                    type="button"
                    variant={swapType === 'CYLINDER' ? "default" : "outline"}
                    onClick={() => setSwapType('CYLINDER')}
                    className="flex-1 h-10 text-sm"
                  >
                    Cylinder
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{swapType === 'BA' ? 'Backplate' : 'Cylinder'}</label>
                  {!newMovement.ba_id && <span className="text-xs text-red-500">Required</span>}
                </div>
                <Select
                  value={newMovement.ba_id?.toString()}
                  onValueChange={(value) => setNewMovement({ ...newMovement, ba_id: parseInt(value) })}
                  disabled={!selectedLocation}
                >
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue placeholder={selectedLocation ? `Select ${swapType === 'BA' ? 'Backplate' : 'Cylinder'}` : "Select a location first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredBAs.map((ba) => {
                      // Extract role or set number for display
                      let roleText = '';
                      if (ba.location) {
                        const roleMatch = ba.location.match(/(FF1|FF2|SC|PO|Set \d+)/i);
                        roleText = roleMatch ? ` - ${roleMatch[0]}` : '';
                      }
                      
                      return (
                        <SelectItem key={ba.id} value={ba.id.toString()} className="text-sm">
                          {swapType === 'BA' ? ba.serial_number : ba.cylinder_serial}{roleText}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Enter Serial Number</label>
                  {!newMovement.to_location && <span className="text-xs text-red-500">Required</span>}
                </div>
                <Input
                  value={newMovement.to_location || ''}
                  onChange={(e) => setNewMovement({ ...newMovement, to_location: e.target.value })}
                  placeholder={`Enter new ${swapType.toLowerCase()} serial number`}
                  className={`h-10 text-sm ${serialNumberError ? "border-red-500" : ""}`}
                />
                {serialNumberError && (
                  <p className="text-xs text-red-500 mt-1">{serialNumberError}</p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Remarks</label>
                <Textarea
                  value={newMovement.remarks || ''}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewMovement({ ...newMovement, remarks: e.target.value })}
                  placeholder="Enter any additional remarks"
                  className="min-h-[80px] text-sm"
                />
              </div>
            </div>
            <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-0">
              <Button 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)} 
                disabled={isSubmitting}
                className="w-full sm:w-auto h-11 text-sm"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleCreateMovement}
                disabled={!newMovement.ba_id || !selectedLocation || !newMovement.to_location || serialNumberError !== null || isSubmitting}
                className="w-full sm:w-auto h-11 text-sm"
              >
                {isSubmitting ? "Creating..." : "Create Movement"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-lg">
        {/* Responsive Design: Table for desktop, Cards for mobile */}
        <div className="hidden md:block"> {/* Hide on mobile, show on desktop */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>BA Set</TableHead>
                <TableHead>Swapped with</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Remarks</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((movement) => {
                const ba = baList.find(b => b.id === movement.ba_id)
                return (
                  <TableRow key={movement.id}>
                    <TableCell>
                      {format(new Date(movement.movement_date), 'dd MMM yyyy HH:mm')}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{ba?.location || 'Unknown'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {movement.remarks?.includes('CYLINDER') ? ba?.cylinder_serial : ba?.serial_number}
                        </span>
                        <span className="text-xs text-gray-500">
                          {movement.remarks?.includes('CYLINDER') ? 'Cylinder' : 'Backplate'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={movement.status}
                        onValueChange={(value) => handleUpdateStatus(movement.id, value as BaMovements['status'])}
                        disabled={movement.status === 'COMPLETED'}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PENDING">Pending</SelectItem>
                          <SelectItem value="COMPLETED">Completed</SelectItem>
                          <SelectItem value="CANCELLED">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>{movement.remarks || '-'}</TableCell>
                    <TableCell className="text-right">
                      {movement.status === 'PENDING' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUpdateStatus(movement.id, 'COMPLETED')}
                        >
                          Complete
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
              {movements.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-4">
                    No movements found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden"> {/* Show on mobile, hide on desktop */}
          <div className="space-y-4 p-4">
            {movements.length === 0 ? (
              <div className="text-center py-4 text-gray-500">
                No movements found
              </div>
            ) : (
              movements.map((movement) => {
                const ba = baList.find(b => b.id === movement.ba_id);
                return (
                  <div 
                    key={movement.id} 
                    className="bg-white dark:bg-[#2E2521] rounded-lg shadow p-4 border border-gray-200 dark:border-[#FCF6EC]/20"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-medium">{ba?.location || 'Unknown'}</div>
                      </div>
                      <div className="px-2 py-1 rounded-full text-xs font-medium" 
                        style={{
                          backgroundColor: movement.status === 'PENDING' 
                            ? 'rgba(245, 158, 11, 0.1)' 
                            : movement.status === 'COMPLETED' 
                            ? 'rgba(16, 185, 129, 0.1)' 
                            : 'rgba(239, 68, 68, 0.1)',
                          color: movement.status === 'PENDING' 
                            ? 'rgb(245, 158, 11)' 
                            : movement.status === 'COMPLETED' 
                            ? 'rgb(16, 185, 129)' 
                            : 'rgb(239, 68, 68)'
                        }}
                      >
                        {movement.status}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-y-1 text-sm mb-3">
                      <div className="text-gray-500">Date:</div>
                      <div>{format(new Date(movement.movement_date), 'dd MMM yyyy HH:mm')}</div>
                      
                      <div className="text-gray-500">Serial Number:</div>
                      <div>{movement.remarks?.includes('CYLINDER') ? ba?.cylinder_serial : ba?.serial_number}</div>
                      
                      <div className="text-gray-500">Swapped with:</div>
                      <div>{movement.to_location}</div>
                      
                      {movement.remarks && (
                        <>
                          <div className="text-gray-500">Remarks:</div>
                          <div>{movement.remarks}</div>
                        </>
                      )}
                    </div>
                    
                    {movement.status === 'PENDING' && (
                      <div className="flex justify-end mt-2">
                        <Select
                          value={movement.status}
                          onValueChange={(value) => handleUpdateStatus(movement.id, value as BaMovements['status'])}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PENDING">Pending</SelectItem>
                            <SelectItem value="COMPLETED">Completed</SelectItem>
                            <SelectItem value="CANCELLED">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
} 