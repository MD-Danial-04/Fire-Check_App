'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Pencil, Trash2, Plus, AlertCircle } from 'lucide-react'
import { useToast } from "@/components/ui/use-toast"

// Initialize Supabase client with SSR support
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface VehicleConfig {
  id: number
  name: string
  plate_number: string
  section: string
  created_at?: string
  updated_at?: string
}

export default function VehicleConfigPage() {
  const [vehicles, setVehicles] = useState<VehicleConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [currentVehicle, setCurrentVehicle] = useState<VehicleConfig | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    plate_number: '',
    section: 'VEHICLE FPT'
  })
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const { toast } = useToast()

  // Initial vehicle data to populate if empty
  const initialVehicles = [
    { name: 'CFS FRC', plate_number: 'QX1859E', section: 'VEHICLE FPT' },
    { name: 'Class 4 Truck', plate_number: 'YN4304C', section: 'VEHICLE FPT' },
    { name: 'LF811', plate_number: 'GDB7755P', section: 'VEHICLE FPT' },
    { name: 'LF812', plate_number: 'GBD6351C', section: 'VEHICLE FPT' },
    { name: 'Admin FRC', plate_number: 'QX1034T', section: 'VEHICLE FPT' },
    { name: 'Spare LF', plate_number: 'GBF8661J', section: 'VEHICLE FPT' },
    { name: 'CFS FRC', plate_number: 'QX1859E', section: 'VEHICLE LPT' },
    { name: 'Class 4 Truck', plate_number: 'YN4304C', section: 'VEHICLE LPT' },
    { name: 'LF811', plate_number: 'GBF8661J', section: 'VEHICLE LPT' },
    { name: 'LF812', plate_number: 'GBD6351C', section: 'VEHICLE LPT' },
    { name: 'Admin FRC', plate_number: 'QX1034T', section: 'VEHICLE LPT' },
    { name: 'Spare LF', plate_number: 'GBD7755P', section: 'VEHICLE LPT' }
  ]

  // Fetch vehicle configurations on component mount
  useEffect(() => {
    fetchVehicles()
    
    // Set up real-time subscription
    const channel = supabase
      .channel('vehicle_configs_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'vehicle_configs'
      }, () => {
        fetchVehicles()
      })
      .subscribe()
    
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Function to add initial vehicles if table is empty
  const addInitialVehicles = async () => {
    try {
      console.log('Adding initial vehicle configurations...')
      
      // First check if we already have data
      const { count, error: countError } = await supabase
        .from('vehicle_configs')
        .select('*', { count: 'exact', head: true })
      
      if (countError) {
        console.error('Error checking vehicle_configs table:', countError)
        throw countError
      }
      
      if (count && count > 0) {
        console.log(`Table already has ${count} records, skipping initial data insertion`)
        toast({
          title: "Data Already Exists",
          description: `Found ${count} existing records. No need to add initial data.`,
        })
        
        // Refresh the data to show existing records
        fetchVehicles()
        return
      }
      
      // Prepare the data with timestamps
      const vehiclesWithTimestamps = initialVehicles.map(vehicle => ({
        ...vehicle,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }))
      
      console.log('Inserting initial vehicles:', vehiclesWithTimestamps)
      
      // Insert the data
      const { data, error } = await supabase
        .from('vehicle_configs')
        .insert(vehiclesWithTimestamps)
        .select()
      
      if (error) {
        console.error('Error inserting initial vehicle configurations:', error)
        throw error
      }
      
      console.log('Initial vehicle configurations added successfully:', data)
      
      toast({
        title: "Success",
        description: `Added ${data?.length || initialVehicles.length} initial vehicle configurations`
      })
      
      // Refresh the data
      fetchVehicles()
    } catch (error) {
      console.error('Error adding initial vehicle configurations:', error)
      toast({
        title: "Error",
        description: "Failed to add initial vehicle configurations. Check console for details.",
        variant: "destructive"
      })
    }
  }

  const fetchVehicles = async () => {
    try {
      setIsLoading(true)
      setConnectionError(null)
      console.log('Fetching vehicles from Supabase...')
      
      // Log the Supabase URL to verify connection
      console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
      
      // First check if we can access the table at all
      const { count, error: countError } = await supabase
        .from('vehicle_configs')
        .select('*', { count: 'exact', head: true })
      
      if (countError) {
        console.error('Error checking vehicle_configs table:', countError)
        setConnectionError(countError.message)
        throw countError
      }
      
      console.log(`Found ${count || 0} vehicle records in database`)
      
      // Now fetch the actual data
      const { data, error } = await supabase
        .from('vehicle_configs')
        .select('*')
        .order('section', { ascending: true })
        .order('name', { ascending: true })
      
      console.log('Fetch response:', { data, error })
      
      if (error) {
        setConnectionError(error.message)
        throw error
      }
      
      if (data && data.length > 0) {
        setVehicles(data)
        console.log('Vehicles set in state:', data.length)
      } else {
        setVehicles([])
        console.log('No vehicles found in database')
        
        // If no vehicles found, show a button to add initial data
        toast({
          title: "No vehicles found",
          description: "You can add initial vehicle data or create your own",
          variant: "default"
        })
      }
    } catch (error) {
      console.error('Error fetching vehicle configurations:', error)
      setVehicles([])
      toast({
        title: "Error",
        description: "Failed to load vehicle configurations. Check console for details.",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSectionChange = (value: string) => {
    setFormData(prev => ({ ...prev, section: value }))
  }

  const handleAddVehicle = () => {
    setCurrentVehicle(null)
    setFormData({
      name: '',
      plate_number: '',
      section: 'VEHICLE FPT'
    })
    setIsDialogOpen(true)
  }

  const handleEditVehicle = (vehicle: VehicleConfig) => {
    setCurrentVehicle(vehicle)
    setFormData({
      name: vehicle.name,
      plate_number: vehicle.plate_number,
      section: vehicle.section
    })
    setIsDialogOpen(true)
  }

  const handleDeleteVehicle = (vehicle: VehicleConfig) => {
    setCurrentVehicle(vehicle)
    setIsDeleteDialogOpen(true)
  }

  const handleSubmit = async () => {
    try {
      // Validate form data
      if (!formData.name || !formData.plate_number) {
        toast({
          title: "Validation Error",
          description: "Vehicle name and plate number are required",
          variant: "destructive"
        })
        return
      }
      
      if (currentVehicle) {
        // Update existing vehicle
        const { error } = await supabase
          .from('vehicle_configs')
          .update({
            name: formData.name,
            plate_number: formData.plate_number,
            section: formData.section,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentVehicle.id)
        
        if (error) throw error
        
        toast({
          title: "Success",
          description: "Vehicle configuration updated successfully"
        })
      } else {
        // Add new vehicle
        const { error } = await supabase
          .from('vehicle_configs')
          .insert({
            name: formData.name,
            plate_number: formData.plate_number,
            section: formData.section,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        
        if (error) throw error
        
        toast({
          title: "Success",
          description: "Vehicle configuration added successfully"
        })
      }
      
      setIsDialogOpen(false)
      fetchVehicles()
    } catch (error) {
      console.error('Error submitting vehicle configuration:', error)
      toast({
        title: "Error",
        description: "Failed to save vehicle configuration. Check console for details.",
        variant: "destructive"
      })
    }
  }

  const handleConfirmDelete = async () => {
    try {
      if (!currentVehicle) return
      
      const { error } = await supabase
        .from('vehicle_configs')
        .delete()
        .eq('id', currentVehicle.id)
      
      if (error) throw error
      
      toast({
        title: "Success",
        description: "Vehicle configuration deleted successfully"
      })
      
      setIsDeleteDialogOpen(false)
      fetchVehicles()
    } catch (error) {
      console.error('Error deleting vehicle configuration:', error)
      toast({
        title: "Error",
        description: "Failed to delete vehicle configuration. Check console for details.",
        variant: "destructive"
      })
    }
  }

  const checkConnection = async () => {
    try {
      console.log('Checking connection and RLS policy...');
      
      // Test direct query to check RLS policy
      const { count, error } = await supabase
        .from('vehicle_configs')
        .select('*', { count: 'exact', head: true });
      
      console.log('Count query result:', { count, error });
      
      if (error) {
        setConnectionError(error.message);
        toast({
          title: "RLS Policy Error",
          description: `Error: ${error.message}. Check console for details.`,
          variant: "destructive"
        });
      } else {
        setConnectionError(null);
        toast({
          title: "Connection OK",
          description: `Found ${count || 0} records in database. Check console for details.`,
        });
        
        // Now try to get the actual data
        const { data, error: dataError } = await supabase
          .from('vehicle_configs')
          .select('*');
          
        console.log('Data query result:', { data, error: dataError });
        
        if (dataError) {
          setConnectionError(dataError.message);
          toast({
            title: "Data Fetch Error",
            description: `Error: ${dataError.message}. Check console for details.`,
            variant: "destructive"
          });
        } else if (data && data.length > 0) {
          setVehicles(data);
          toast({
            title: "Data Loaded",
            description: `Successfully loaded ${data.length} vehicle records.`,
          });
        } else {
          toast({
            title: "No Data Found",
            description: "The table exists but contains no records. Try adding default vehicles.",
          });
        }
      }
    } catch (err) {
      console.error('Connection test error:', err);
      toast({
        title: "Connection Error",
        description: "Failed to connect to database. Check console for details.",
        variant: "destructive"
      });
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      <header className="border-b border-neutral-100 bg-white dark:bg-neutral-900 dark:border-neutral-800">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4 flex-1">
            <h1 className="text-xl font-semibold dark:text-white">Vehicle Configuration</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6 bg-gray-50 dark:bg-neutral-900">
        <div className="mx-auto max-w-7xl space-y-6">
          {connectionError && (
            <Card className="border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-red-800 dark:text-red-300">Database Connection Error</h3>
                    <p className="text-sm text-red-700 dark:text-red-400 mt-1">{connectionError}</p>
                    <p className="text-sm text-red-700 dark:text-red-400 mt-2">
                      This is likely due to Row Level Security (RLS) policies. You have two options:
                    </p>
                    <div className="mt-3 space-y-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full bg-white dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/50"
                        onClick={checkConnection}
                      >
                        Retry Connection
                      </Button>
                      <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                        To fix this issue, you need to disable RLS or update the policy in the Supabase dashboard:
                      </p>
                      <ol className="text-xs text-red-700 dark:text-red-400 list-decimal pl-5 space-y-1">
                        <li>Go to <a href="https://app.supabase.com" target="_blank" rel="noopener noreferrer" className="underline">Supabase Dashboard</a></li>
                        <li>Select your project</li>
                        <li>Go to Authentication → Policies</li>
                        <li>Find the vehicle_configs table</li>
                        <li>Click "Disable RLS" or update the policy to allow public access</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-gray-200 dark:border-neutral-700 dark:bg-neutral-800">
            <CardHeader className="flex flex-row items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-neutral-700">
              <CardTitle className="text-base font-semibold dark:text-white">Manage Vehicle Configurations</CardTitle>
              <div className="flex gap-2">
                {vehicles.length === 0 && (
                  <>
                    <Button 
                      onClick={addInitialVehicles}
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      Add Default Vehicles
                    </Button>
                    <Button 
                      onClick={checkConnection}
                      variant="secondary"
                      className="flex items-center gap-2"
                    >
                      Check Connection
                    </Button>
                  </>
                )}
                <Button 
                  onClick={handleAddVehicle}
                  className="flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Vehicle
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Vehicle Name</TableHead>
                      <TableHead className="w-[200px]">Plate Number</TableHead>
                      <TableHead className="w-[200px]">Section</TableHead>
                      <TableHead className="w-[150px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8">
                          Loading vehicle configurations...
                        </TableCell>
                      </TableRow>
                    ) : vehicles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8">
                          No vehicle configurations found. Add your first vehicle or use the "Add Default Vehicles" button.
                        </TableCell>
                      </TableRow>
                    ) : (
                      vehicles.map((vehicle) => (
                        <TableRow key={vehicle.id}>
                          <TableCell className="font-medium">{vehicle.name}</TableCell>
                          <TableCell>{vehicle.plate_number}</TableCell>
                          <TableCell>{vehicle.section}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditVehicle(vehicle)}
                                aria-label={`Edit ${vehicle.name}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteVehicle(vehicle)}
                                aria-label={`Delete ${vehicle.name}`}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Add/Edit Vehicle Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{currentVehicle ? 'Edit Vehicle' : 'Add New Vehicle'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Vehicle Name</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="e.g., CFS FRC"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plate_number">Plate Number</Label>
              <Input
                id="plate_number"
                name="plate_number"
                value={formData.plate_number}
                onChange={handleInputChange}
                placeholder="e.g., QX1859E"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="section">Section</Label>
              <Select
                value={formData.section}
                onValueChange={handleSectionChange}
              >
                <SelectTrigger id="section">
                  <SelectValue placeholder="Select section" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VEHICLE FPT">VEHICLE FPT</SelectItem>
                  <SelectItem value="VEHICLE LPT">VEHICLE LPT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>{currentVehicle ? 'Update' : 'Add'} Vehicle</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>Are you sure you want to delete the vehicle "{currentVehicle?.name} ({currentVehicle?.plate_number})"?</p>
            <p className="text-red-500 mt-2">This action cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} 