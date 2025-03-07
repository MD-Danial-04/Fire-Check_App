'use client'

import { createBrowserClient } from '@supabase/ssr'
import { useEffect, useState } from 'react'
import { Search, ExternalLink, Copy, Plus } from 'lucide-react'
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { ResponsiveTable } from "@/components/ui/responsive-table"
import { DialogFooter } from "@/components/ui/dialog"

interface Personnel {
  id: string;
  personnel_name: string;
  grouping: string | null;
  vessel_backplate: string | null;
  vessel_cylinder: string | null;
  lfav_backplate: string | null;
  lfav_cylinder: string | null;
}

interface GroupedPersonnel {
  name: string;
  grouping: string;
  vessel_backplate: string | null;
  vessel_cylinder: string | null;
  lfav_backplate: string | null;
  lfav_cylinder: string | null;
}

// Create Supabase client outside component
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    },
    db: {
      schema: 'public'
    }
  }
);

export default function PPECheck() {
  const [groupedPersonnel, setGroupedPersonnel] = useState<GroupedPersonnel[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [prefilledUrl, setPrefilledUrl] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<GroupedPersonnel | null>(null);
  const { toast } = useToast();

  // Define the exact grouping order
  const groupingOrder = ["REGULARS", "NS SECTION COMMANDER", "NS MARINE FIREFIGHTER", "ORNS/VES"];

  // Add rank order function
  const getRankOrder = (name: string) => {
    const rank = name.split(' ')[0].toUpperCase();
    const rankOrder: { [key: string]: number } = {
      // Regulars
      'LTA': 1,
      'WO2': 2,
      'WO1': 3,
      'SGT3': 4,
      // Firefighters
      'SGT': 1,
      'CPL': 2,
      'LCP': 3
    };
    return rankOrder[rank] || 999; // Default high number for unknown ranks
  };

  useEffect(() => {
    let mounted = true;
    let retryCount = 0;
    const maxRetries = 5;
    let retryTimeout: NodeJS.Timeout;
    let channel: ReturnType<typeof supabase.channel>;

    async function setupRealtimeSubscription() {
      if (!mounted) return;
      
      if (retryCount >= maxRetries) {
        console.error('Max retries reached for realtime subscription');
        return;
      }

      try {
        // Clean up any existing channel before creating a new one
        if (channel) {
          await supabase.removeChannel(channel);
        }

        // Create a new channel with a unique name
        const channelName = `ppe_check_${Date.now()}`;
        channel = supabase.channel(channelName, {
          config: {
            broadcast: { ack: true },
            presence: { key: '' }
          }
        });

        // Set up all the listeners before subscribing
        channel
          .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'personnel'
          }, () => mounted && fetchData())
          .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'vehicle_assignments'
          }, () => mounted && fetchData())
          .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'ba_master_list'
          }, () => mounted && fetchData())
          .on('system', { event: '*' }, (payload: { event: string; [key: string]: any }) => {
            console.log('System event:', payload);
          });

        // Subscribe with error handling
        const status = await channel.subscribe(async (status, err) => {
          if (!mounted) return;
          
          console.log(`Subscription status: ${status}`, err || '');
          
          if (status === 'SUBSCRIBED') {
            console.log('Successfully subscribed to changes');
            retryCount = 0; // Reset retry count on successful subscription
            await fetchData();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.error(`Channel ${status}:`, err);
            retrySubscription();
          }
        });

        console.log('Channel setup completed:', status);
      } catch (error) {
        console.error('Error setting up subscription:', error);
        retrySubscription();
      }
    }

    function retrySubscription() {
      if (!mounted) return;
      
      retryCount++;
      if (retryCount < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Exponential backoff with 10s max
        console.log(`Retrying subscription in ${delay}ms (attempt ${retryCount} of ${maxRetries})...`);
        
        clearTimeout(retryTimeout);
        retryTimeout = setTimeout(() => {
          if (mounted) {
            setupRealtimeSubscription();
          }
        }, delay);
      }
    }

    async function fetchData() {
      console.log('Fetching PPE data...');
      setIsLoading(true);
      
      try {
        // Fetch all required data in parallel
        const [personnelResponse, baViewResponse] = await Promise.all([
          supabase
            .from('personnel')
            .select('name, grouping')
            .returns<{ name: string; grouping: string }[]>(),
          supabase
            .from('personnel_ba_view')
            .select('*')
            .order('personnel_name')
        ]);

        if (personnelResponse.error) {
          console.error('Error fetching personnel:', personnelResponse.error);
          return;
        }

        if (baViewResponse.error) {
          console.error('Error fetching BA data:', baViewResponse.error);
          return;
        }

        const personnelData = personnelResponse.data;
        const baData = baViewResponse.data;

        if (!personnelData?.length) {
          console.warn('No personnel data found');
          return;
        }

        if (!baData?.length) {
          console.warn('No BA data found');
          return;
        }

        // Process data as before...
        const groupingMap = new Map(
          personnelData.flatMap(p => {
            const nameParts = p.name.split(' ');
            const nameWithoutRank = nameParts.slice(1).join(' ').toLowerCase();
            const fullName = p.name.toLowerCase();
            return [
              [fullName, p.grouping || 'Unknown'],
              [nameWithoutRank, p.grouping || 'Unknown']
            ];
          })
        );

        // Group and process BA data
        const groupedByName = baData.reduce((acc: { [key: string]: GroupedPersonnel }, curr) => {
          const name = curr.personnel_name;
          if (!name) return acc;

          const fullName = name.toLowerCase();
          const nameParts = name.split(' ');
          const nameWithoutRank = nameParts.slice(1).join(' ').toLowerCase();
          const grouping = groupingMap.get(fullName) || groupingMap.get(nameWithoutRank) || 'Marine Firefighter';

          if (!acc[name]) {
            acc[name] = {
              name,
              grouping,
              vessel_backplate: null,
              vessel_cylinder: null,
              lfav_backplate: null,
              lfav_cylinder: null
            };
          }

          acc[name].vessel_backplate = curr.vessel_backplate || acc[name].vessel_backplate;
          acc[name].vessel_cylinder = curr.vessel_cylinder || acc[name].vessel_cylinder;
          acc[name].lfav_backplate = curr.lfav_backplate || acc[name].lfav_backplate;
          acc[name].lfav_cylinder = curr.lfav_cylinder || acc[name].lfav_cylinder;

          return acc;
        }, {});

        // Sort the data
        const groupedArray = Object.values(groupedByName).sort((a, b) => {
          const categoryA = getCategory(a.grouping);
          const categoryB = getCategory(b.grouping);
          
          const indexA = groupingOrder.indexOf(categoryA);
          const indexB = groupingOrder.indexOf(categoryB);
          
          if (indexA !== indexB) return indexA - indexB;
          
          if ((categoryA === 'REGULARS' && categoryB === 'REGULARS') ||
              (categoryA === 'NS MARINE FIREFIGHTER' && categoryB === 'NS MARINE FIREFIGHTER')) {
            return getRankOrder(a.name) - getRankOrder(b.name);
          }
          
          return a.name.localeCompare(b.name);
        });

        setGroupedPersonnel(groupedArray);
      } catch (error) {
        console.error('Error processing data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    // Initial setup
    fetchData();
    setupRealtimeSubscription();

    // Cleanup
    return () => {
      mounted = false;
      clearTimeout(retryTimeout);
      if (channel) {
        console.log('Cleaning up subscription...');
        supabase.removeChannel(channel);
      }
    };
  }, []);

  // Filter personnel based on search term
  const filteredPersonnel = groupedPersonnel.filter(person =>
    person.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (person.vessel_backplate?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (person.vessel_cylinder?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (person.lfav_backplate?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (person.lfav_cylinder?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  // Map the groupings to our standard categories
  const getCategory = (grouping: string) => {
    // For Regulars
    if (grouping === 'Rota Commander' ||
        grouping === 'Deputy Rota Commander' ||
        grouping === 'Marine Section Commander' ||
        grouping === 'Marine Specialist') {
      return 'REGULARS';
    }
    
    // For NS Section Commander
    if (grouping === 'Navigation Specialist') {
      return 'NS SECTION COMMANDER';
    }
    
    // For NS Marine Firefighter
    if (grouping === 'Marine Firefighter') {
      return 'NS MARINE FIREFIGHTER';
    }
    
    // For ORNS/VES
    if (grouping === 'Reservist / VES' || 
        grouping === 'Watchroom Operator') {
      return 'ORNS/VES';
    }
    
    return 'Unknown';
  };

  // Group personnel by category for display
  const personnelByCategory = filteredPersonnel.reduce((acc: { [key: string]: GroupedPersonnel[] }, person) => {
    // Get the display category
    const category = getCategory(person.grouping);
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(person);
    return acc;
  }, {});

  const handleFormFill = async (person: GroupedPersonnel) => {
    setSelectedPerson(person);
    const today = new Date();
    const formattedDate = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;
    
    try {
      // Get vehicle assignments for the person
      const { data: assignments, error } = await supabase
        .from('vehicle_assignments')
        .select('vehicle_type')
        .eq('personnel_name', person.name);

      if (error) throw error;
      
      if (!assignments?.length) {
        toast({
          title: "No Assignments Found",
          description: "No vehicle assignments found for this person",
          variant: "destructive",
        });
        return;
      }

      // Prepare BA sets based on vehicle assignments
      const baSets: any = {};
      
      // Check for vessel (MRV/RFV) assignment
      const vesselAssignment = assignments.find(a => a.vehicle_type.includes('MRV') || a.vehicle_type.includes('RFV'));
      if (vesselAssignment) {
        const vesselType = vesselAssignment.vehicle_type.replace(/(\d+)/, ' $1'); // Add space before numbers
        if (person.vessel_backplate && person.vessel_cylinder) {
          baSets.vessel = {
            appliance: vesselType,
            backplate: person.vessel_backplate,
            cylinder: person.vessel_cylinder
          };
        } else {
          baSets.vesselType = vesselType;
        }
      }
      
      // Check for LF assignment
      const lfAssignment = assignments.find(a => a.vehicle_type.includes('LF'));
      if (lfAssignment) {
        const lfType = lfAssignment.vehicle_type.replace(/(\d+)/, ' $1'); // Add space before numbers
        if (person.lfav_backplate && person.lfav_cylinder) {
          baSets.lf = {
            appliance: lfType,
            backplate: person.lfav_backplate,
            cylinder: person.lfav_cylinder
          };
        } else {
          baSets.lfType = lfType;
        }
      }

      const response = await fetch('/api/fill-form', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: person.name,
          baSets
        })
      });

      const result = await response.json();

      if (result.success) {
        // Show dialog with pre-filled URL
        setPrefilledUrl(result.url);
        setIsDialogOpen(true);
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to generate form URL",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error generating form URL:', error);
      toast({
        title: "Error",
        description: "Failed to generate form URL. Please try again or fill manually.",
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(prefilledUrl);
      toast({
        title: "Copied!",
        description: "Form URL copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy URL to clipboard",
        variant: "destructive",
      });
    }
  };

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center">Loading...</div>
  );

  return (
    <div className="flex-1 p-4 md:p-8 overflow-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">PPE Check</h1>
          <div className="relative w-full sm:w-64 md:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              type="search"
              placeholder="Search personnel or equipment..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full"
              aria-label="Search personnel or equipment"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-neutral-900 dark:border-neutral-100"></div>
          </div>
        ) : (
          /* Categories */
          groupingOrder.map(category => {
            const personnel = filteredPersonnel.filter(p => getCategory(p.grouping) === category);
            if (!personnel?.length) return null;

            return (
              <Card key={category} className="overflow-hidden">
                <CardHeader className="px-4 md:px-6 py-3 md:py-4">
                  <CardTitle className="text-lg">{category}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {/* Desktop View - ResponsiveTable */}
                  <div className="hidden md:block">
                    <ResponsiveTable
                      columns={[
                        {
                          key: "name",
                          header: "Name",
                          className: "w-[20%]"
                        },
                        {
                          key: "vessel_backplate",
                          header: "Vessel Backplate",
                          className: "w-[16%]",
                          render: (value) => value || '-'
                        },
                        {
                          key: "vessel_cylinder",
                          header: "Vessel Cylinder",
                          className: "w-[16%]",
                          render: (value) => value || '-'
                        },
                        {
                          key: "lfav_backplate",
                          header: "LFAV Backplate",
                          className: "w-[16%]",
                          render: (value) => value || '-'
                        },
                        {
                          key: "lfav_cylinder",
                          header: "LFAV Cylinder",
                          className: "w-[16%]",
                          render: (value) => value || '-'
                        },
                        {
                          key: "actions",
                          header: "Actions",
                          className: "w-[16%]",
                          render: (_, person) => (
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleFormFill(person)}
                                className="whitespace-nowrap"
                              >
                                <Copy className="h-4 w-4 mr-2" />
                                Fill Form
                              </Button>
                            </div>
                          )
                        }
                      ]}
                      data={personnel}
                      keyField="name"
                      emptyMessage="No personnel found"
                    />
                  </div>
                  
                  {/* Mobile View - Custom Cards */}
                  <div className="md:hidden px-4 py-2 space-y-4">
                    {personnel.map((person, index) => (
                      <div 
                        key={person.name || index}
                        className="p-5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-neutral-900 shadow-sm"
                      >
                        {/* Name with better styling */}
                        <div className="font-bold text-base mb-5">{person.name}</div>
                        
                        {/* Equipment Grid */}
                        <div className="space-y-4">
                          {/* Vessel Row */}
                          <div className="grid grid-cols-2 gap-6">
                            <div>
                              <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">
                                Vessel Backplate
                              </div>
                              <div className="font-medium text-sm">
                                {person.vessel_backplate || '-'}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">
                                Vessel Cylinder
                              </div>
                              <div className="font-medium text-sm">
                                {person.vessel_cylinder || '-'}
                              </div>
                            </div>
                          </div>
                          
                          {/* LFAV Row */}
                          <div className="grid grid-cols-2 gap-6">
                            <div>
                              <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">
                                LFAV Backplate
                              </div>
                              <div className="font-medium text-sm">
                                {person.lfav_backplate || '-'}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">
                                LFAV Cylinder
                              </div>
                              <div className="font-medium text-sm">
                                {person.lfav_cylinder || '-'}
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {/* Actions */}
                        <div className="mt-5">
                          <Button
                            variant="outline"
                            size="default"
                            onClick={() => handleFormFill(person)}
                            className="w-full flex items-center justify-center h-10"
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Fill Form
                          </Button>
                        </div>
                      </div>
                    ))}
                    
                    {personnel.length === 0 && (
                      <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
                        No personnel found
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}

        {/* Dialog for form URL */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Form URL Generated</DialogTitle>
              <DialogDescription>
                Copy this URL to access the pre-filled form for {selectedPerson?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center space-x-2">
              <div className="grid flex-1 gap-2">
                <Input
                  value={prefilledUrl}
                  readOnly
                  className="w-full"
                />
              </div>
              <Button 
                type="button" 
                size="sm" 
                className="px-3" 
                onClick={copyToClipboard}
              >
                <span className="sr-only">Copy</span>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <DialogFooter className="sm:justify-start">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  window.open(prefilledUrl, '_blank');
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open Form
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
} 