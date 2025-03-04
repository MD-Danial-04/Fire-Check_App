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
      
      // Check for vessel (MRV/RFV) assignment and BA set
      if (assignments.some(a => a.vehicle_type.includes('MRV') || a.vehicle_type.includes('RFV')) && 
          person.vessel_backplate && person.vessel_cylinder) {
        const vesselType = assignments.find(a => a.vehicle_type.includes('MRV') || a.vehicle_type.includes('RFV'))?.vehicle_type;
        baSets.vessel = {
          appliance: vesselType?.replace(/(\d+)/, ' $1'), // Add space before numbers (MRV811 -> MRV 811)
          backplate: person.vessel_backplate,
          cylinder: person.vessel_cylinder
        };
      }
      
      // Check for LF assignment and BA set
      if (assignments.some(a => a.vehicle_type.includes('LF')) && 
          person.lfav_backplate && person.lfav_cylinder) {
        const lfType = assignments.find(a => a.vehicle_type.includes('LF'))?.vehicle_type;
        baSets.lf = {
          appliance: lfType?.replace(/(\d+)/, ' $1'), // Add space before numbers (LF811 -> LF 811)
          backplate: person.lfav_backplate,
          cylinder: person.lfav_cylinder
        };
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
    <div className="flex-1 flex flex-col">
      {/* Decorative Elements */}
      <div className="fixed top-6 left-6 w-1.5 h-1.5 rounded-full bg-gray-900 dark:bg-[#FCF6EC]" />
      <div className="fixed top-6 right-6 w-1.5 h-1.5 rounded-full bg-gray-900 dark:bg-[#FCF6EC]" />
      
      {/* Standardized Header */}
      <header className="border-b border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between mb-12 max-w-7xl mx-auto">
            <div className="space-y-0.5">
              <span className="text-[10px] tracking-[0.2em] text-gray-500 uppercase block">Fire Check</span>
              <h1 className="text-[32px] font-normal tracking-[-0.02em] text-gray-900 dark:text-[#FCF6EC] uppercase">PPE CHECK</h1>
            </div>
            <span className="text-[10px] tracking-[0.2em] text-gray-500 dark:text-[#FCF6EC]/60 uppercase">BA ASSIGNMENT</span>
          </div>
          
          {/* Search Bar and Add Button */}
          <div className="mt-6 flex items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input 
                type="search" 
                placeholder="Search by name or serial number..." 
                className="pl-10 bg-neutral-50 dark:bg-[#1C1917] border-0 w-full focus-visible:ring-neutral-900"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button className="bg-neutral-900 hover:bg-neutral-800 dark:bg-[#2E2521] dark:hover:bg-[#2E2521]/80 font-['Azeret_Mono'] h-9 px-3 rounded-md transition-colors text-xs tracking-wide border border-gray-200 dark:border-[#FCF6EC]/20 flex items-center gap-1">
              <Plus className="h-4 w-4 text-white dark:text-[#FCF6EC]" /> 
              <span className="text-white dark:text-[#FCF6EC]">Add Personnel</span>
          </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          {isLoading ? (
            <div>Loading...</div>
          ) : (
            /* Categories */
            groupingOrder.map(category => {
              const personnel = filteredPersonnel.filter(p => getCategory(p.grouping) === category);
              if (!personnel?.length) return null;

              return (
                <Card key={category}>
                  <CardHeader>
                    <CardTitle>{category}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table className="table-fixed w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[20%]">Name</TableHead>
                          <TableHead className="w-[16%]">Vessel Backplate</TableHead>
                          <TableHead className="w-[16%]">Vessel Cylinder</TableHead>
                          <TableHead className="w-[16%]">LFAV Backplate</TableHead>
                          <TableHead className="w-[16%]">LFAV Cylinder</TableHead>
                          <TableHead className="w-[16%]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {personnel.map((person) => (
                          <TableRow key={person.name}>
                            <TableCell className="w-[20%]">{person.name}</TableCell>
                            <TableCell className="w-[16%]">{person.vessel_backplate || '-'}</TableCell>
                            <TableCell className="w-[16%]">{person.vessel_cylinder || '-'}</TableCell>
                            <TableCell className="w-[16%]">{person.lfav_backplate || '-'}</TableCell>
                            <TableCell className="w-[16%]">{person.lfav_cylinder || '-'}</TableCell>
                            <TableCell className="w-[16%]">
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleFormFill(person)}
                                >
                                  <Copy className="h-4 w-4 mr-2" />
                                  Fill Form
                                </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </main>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Form Pre-filled</DialogTitle>
            <DialogDescription>
              A link has been created with pre-filled information for {selectedPerson?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center space-x-2">
              <div className="grid flex-1 gap-2">
                <p className="text-sm font-medium">Pre-filled information:</p>
                <ul className="text-sm text-muted-foreground list-disc pl-5">
                  <li>Name: {selectedPerson?.name}</li>
                  {selectedPerson?.vessel_backplate && selectedPerson?.vessel_cylinder && (
                    <li>Vessel BA Set: {selectedPerson.vessel_backplate} / {selectedPerson.vessel_cylinder}</li>
                  )}
                  {selectedPerson?.lfav_backplate && selectedPerson?.lfav_cylinder && (
                    <li>LFAV BA Set: {selectedPerson.lfav_backplate} / {selectedPerson.lfav_cylinder}</li>
                  )}
                </ul>
                <p className="text-sm text-muted-foreground mt-2">
                  Note: You will still need to fill in the remaining fields manually.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
            <Button
              type="button"
              variant="default"
              className="w-full sm:w-auto"
              onClick={() => window.open(prefilledUrl, '_blank')}
            >
              Open Form
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={copyToClipboard}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy URL
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 