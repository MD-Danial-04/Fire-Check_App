'use client'

import { createBrowserClient } from '@supabase/ssr'
import { useEffect, useState, Suspense } from 'react'
import React from 'react'
import { Search, ExternalLink, Copy, Plus, Clipboard, FileCheck, Smartphone, Bookmark } from 'lucide-react'
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
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js';
import { RealtimeChannel } from '@supabase/supabase-js';
import { cn } from "@/lib/utils"
import BookmarkletInstructions from '@/components/BookmarkLetInstructions';
import { useSearchParams } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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

// Create a client component that uses useSearchParams
function PPECheckClient() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
  // Immediate check for Supabase client and form_responses table
  console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log('Supabase client initialized:', !!supabase);

  const searchParams = useSearchParams();
  const [groupedPersonnel, setGroupedPersonnel] = useState<GroupedPersonnel[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [prefilledUrl, setPrefilledUrl] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<GroupedPersonnel | null>(null);
  const [responseId, setResponseId] = useState('');
  const [isResponseIdDialogOpen, setIsResponseIdDialogOpen] = useState(false);
  const { toast } = useToast();
  const [submittedResponses, setSubmittedResponses] = useState<Record<string, string>>({});
  const [viewingResponseId, setViewingResponseId] = useState<string | null>(null);
  const [viewingPersonName, setViewingPersonName] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [tempResponseId, setTempResponseId] = useState<string | null>(null);
  const [tempPersonName, setTempPersonName] = useState<string | null>(null);
  const [showPersonSelectionDialog, setShowPersonSelectionDialog] = useState(false);
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Define the exact grouping order
  const groupingOrder = ["REGULARS", "NS SECTION COMMANDER", "NS MARINE FIREFIGHTER", "ORNS/VES"];

  // Check if we're on mobile
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    };
    
    // Initial check
    checkIfMobile();
    
    // Add event listener
    window.addEventListener('resize', checkIfMobile);
    
    // Cleanup
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

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

  // Function to fetch submitted responses
  const fetchSubmittedResponses = async () => {
    try {
      console.log('Fetching submitted responses...');
      const { data, error } = await supabase
        .from('form_responses')
        .select('personnel_name, response_id')
        .eq('form_type', 'ppe_check')
        .order('submitted_at', { ascending: false });

      if (error) {
        console.error('Error fetching form responses:', error);
        return;
      }
      
      console.log('Fetched form responses:', data);
      
      // Create a map of personnel name to their most recent response ID
      const responseMap: Record<string, string> = {};
      data?.forEach(item => {
        // Only store the first (most recent) response for each person
        if (!responseMap[item.personnel_name]) {
          responseMap[item.personnel_name] = item.response_id;
        }
      });
      
      console.log('Processed response map:', responseMap);
      setSubmittedResponses(responseMap);
    } catch (error) {
      console.error('Error fetching submitted responses:', error);
    }
  };

  useEffect(() => {
    let mounted = true;
    let channel: RealtimeChannel | null = null;
    let retryTimeout: NodeJS.Timeout;
    let retryCount = 0;
    const maxRetries = 5;
    
    console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log('Supabase client initialized:', !!supabase);
    
    // Check if form_responses table exists
    async function checkFormResponsesTable() {
      try {
        console.log('Checking form_responses table...');
        const { data, error } = await supabase
          .from('form_responses')
          .select('response_id')
          .limit(1);
          
        console.log('Form responses table check:', { data, error });
        
        if (error) {
          console.error('Error accessing form_responses table:', error);
          if (error.code === '42P01') {
            console.error('The form_responses table does not exist. Please run the migration.');
          }
        } else {
          console.log('Form responses table exists and is accessible');
        }
      } catch (error) {
        console.error('Error checking form_responses table:', error);
      }
    }
    
    checkFormResponsesTable();
    
    async function fetchData() {
      if (!mounted) return;
      
      try {
        setIsLoading(true);
        
        // Fetch BA data from personnel_ba_view
        const { data: baData, error: baError } = await supabase
          .from('personnel_ba_view')
          .select('*');
          
        if (baError) throw baError;
        
        // Fetch personnel groupings
        const { data: personnelData, error: personnelError } = await supabase
        .from('personnel')
          .select('name, grouping');
          
        if (personnelError) throw personnelError;
        
        // Create a map of name to grouping
        const groupingMap = new Map<string, string>();
        personnelData.forEach(p => {
          if (p.name && p.grouping) {
            groupingMap.set(p.name.toLowerCase(), p.grouping);
          }
        });
        
        // Group and process BA data
        const groupedByName = baData.reduce((acc: { [key: string]: GroupedPersonnel }, curr) => {
          const name = curr.personnel_name;
          if (!name) return acc;

          const fullName = name.toLowerCase();
          const nameParts = name.split(' ');
          const nameWithoutRank = nameParts.slice(1).join(' ').toLowerCase();
          let grouping = groupingMap.get(fullName) || groupingMap.get(nameWithoutRank) || 'Marine Firefighter';
          
          // Special case for SGT3 Mustaqim - ensure he's categorized as a Regular
          if (name.includes('SGT3') || name.toLowerCase().includes('mustaqim')) {
            grouping = 'Marine Section Commander'; // This will map to REGULARS in getCategory
          }

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

    async function setupRealtimeSubscription() {
      if (!mounted) return;
      
      if (retryCount >= maxRetries) {
        console.error('Max retries reached for realtime subscription');
        return;
      }

      try {
        // Clean up any existing channel before creating a new one
        if (channel) {
          try {
            await supabase.removeChannel(channel);
          } catch (err) {
            console.warn('Error removing existing channel:', err);
            // Continue even if there's an error removing the channel
          }
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
        const status = await channel.subscribe(async (status: string, err: any) => {
          if (!mounted) return;
          
          console.log(`Subscription status: ${status}`, err || '');
          
          if (status === 'SUBSCRIBED') {
            console.log('Successfully subscribed to changes');
            retryCount = 0; // Reset retry count on successful subscription
            await fetchData();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.error(`Channel ${status}:`, err);
            // Only retry if we're still mounted and haven't reached max retries
            if (mounted && retryCount < maxRetries) {
              retrySubscription();
            }
          }
        });

        console.log('Channel setup completed:', status);
      } catch (error) {
        console.error('Error setting up subscription:', error);
        if (mounted && retryCount < maxRetries) {
          retrySubscription();
        }
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

    // Initial setup
    fetchData();
    fetchSubmittedResponses();
    setupRealtimeSubscription();
    
    // Set up real-time subscription for form responses
    const formResponsesSubscription = supabase
      .channel('form-responses-changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'form_responses',
      }, (payload) => {
        console.log('Form response change detected:', payload);
        // Refresh the submitted responses when a new one is added
        fetchSubmittedResponses();
      })
      .subscribe((status) => {
        console.log('Form responses subscription status:', status);
      });
      
    // Cleanup
    return () => {
      mounted = false;
      clearTimeout(retryTimeout);
      if (channel) {
        console.log('Cleaning up subscription...');
        supabase.removeChannel(channel);
      }
      supabase.removeChannel(formResponsesSubscription);
    };
  }, []);

  // Add a simpler useEffect to log submitted responses
  useEffect(() => {
    console.log('Submitted responses updated:', Object.keys(submittedResponses).length);
  }, [submittedResponses]);

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
    let category = getCategory(person.grouping);
    
    // Special case for SGT3 Mustaqim - should be in REGULARS
    if (person.name.includes('SGT3') || person.name.includes('Mustaqim')) {
      category = 'REGULARS';
    }
    
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
          baSets,
          // Include any other data that might help identify the person
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

  const handleSubmitResponseId = async () => {
    if (!selectedPerson) {
      toast({
        title: "Error",
        description: "No personnel selected",
        variant: "destructive",
      });
      return;
    }
    
    setIsResponseIdDialogOpen(true);
  };
  
  const saveResponseId = async (personName = selectedPerson?.name, id = responseId) => {
    if (!id || !personName) {
      toast({
        title: "Error",
        description: "Please enter a valid response ID",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('form_responses')
        .insert({
          personnel_name: personName,
          response_id: id,
          form_type: 'ppe_check',
          submitted_at: new Date().toISOString()
        })
        .select();
        
      if (error) {
        console.error('Error saving response ID:', error);
        toast({
          title: "Error",
          description: error.message || "Failed to save response ID",
          variant: "destructive",
        });
        return;
      }
      
      // Update local state
      setSubmittedResponses(prev => ({
        ...prev,
        [personName]: id
      }));
      
      // Set the submitted ID to show the dialog
      setSubmittedId(id);
      
      toast({
        title: "Success",
        description: "Response ID saved successfully",
      });
      
      setResponseId('');
      setIsResponseIdDialogOpen(false);
    } catch (error) {
      console.error('Error in saveResponseId function:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save response ID",
        variant: "destructive",
      });
    }
  };

  const handleViewResponseId = (name: string, responseId: string) => {
    setViewingPersonName(name);
    setViewingResponseId(responseId);
  };

  const handleResetResponseId = async () => {
    try {
      console.log('Starting reset operation...');
      
      if (selectedPerson) {
        console.log(`Resetting response ID for ${selectedPerson.name}`);
        
        // Delete the response from the database first
        const { data, error } = await supabase
          .from('form_responses')
          .delete()
          .eq('personnel_name', selectedPerson.name)
          .eq('form_type', 'ppe_check');
          
        if (error) {
          console.error('Error resetting response ID:', error);
          toast({
            title: "Error",
            description: "Failed to reset response ID",
            variant: "destructive",
          });
          return;
        }
        
        console.log(`Successfully deleted response for ${selectedPerson.name} from database`, data);
        
        // Then update local state
        setSubmittedResponses(prev => {
          const newResponses = { ...prev };
          delete newResponses[selectedPerson.name];
          return newResponses;
        });
        
        toast({
          title: "Success",
          description: `Response ID for ${selectedPerson.name} has been reset`,
        });
      } else {
        console.log('Resetting all response IDs');
        
        // Delete all responses from the database first
        const { data, error } = await supabase
          .from('form_responses')
          .delete()
          .eq('form_type', 'ppe_check');
          
        if (error) {
          console.error('Error resetting all response IDs:', error);
          toast({
            title: "Error",
            description: "Failed to reset all response IDs",
            variant: "destructive",
          });
          return;
        }
        
        console.log('Successfully deleted all responses from database', data);
        
        // Then update local state
        setSubmittedResponses({});
        
        toast({
          title: "Success",
          description: "All response IDs have been reset",
        });
      }
      
      // Clear the response ID and submitted ID
      setResponseId('');
      setSubmittedId(null);
      
      // Force a refetch of submitted responses to ensure UI is in sync with database
      console.log('Refetching submitted responses...');
      await fetchSubmittedResponses();
      console.log('Reset operation completed');
    } catch (error) {
      console.error('Error in handleResetResponseId:', error);
      toast({
        title: "Error",
        description: "Failed to reset response ID",
        variant: "destructive",
      });
    }
  };

  const saveResponseIdForPerson = async (personName: string, responseId: string) => {
    try {
      const { data, error } = await supabase
        .from('form_responses')
        .insert({
          personnel_name: personName,
          response_id: responseId,
          form_type: 'ppe_check',
          submitted_at: new Date().toISOString()
        })
        .select();
        
      if (error) {
        console.error('Error saving response ID:', error);
        toast({
          title: "Error",
          description: error.message || "Failed to save response ID",
          variant: "destructive",
        });
        return;
      }
      
      // Update local state
      setSubmittedResponses(prev => ({
        ...prev,
        [personName]: responseId
      }));
      
      toast({
        title: "Success",
        description: "Response ID saved successfully",
      });
    } catch (error) {
      console.error('Error in saveResponseIdForPerson function:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save response ID",
        variant: "destructive",
      });
    }
  };

  // Process URL parameters
  useEffect(() => {
    if (groupedPersonnel.length === 0) return; // Wait until personnel data is loaded
    
    const urlResponseId = searchParams.get('responseId');
    const urlPersonName = searchParams.get('personName');
    
    if (urlResponseId) {
      console.log('Received response ID from URL:', urlResponseId);
      setTempResponseId(urlResponseId);
      
      if (urlPersonName) {
        console.log('Received person name from URL:', urlPersonName);
        setTempPersonName(urlPersonName);
        
        // Try to find the person by name
        const person = groupedPersonnel.find(p => p.name === urlPersonName);
        if (person) {
          setSelectedPerson(person);
          // Auto-save if we have both response ID and matching person
          saveResponseIdForPerson(person.name, urlResponseId);
        } else {
          // If person not found, show selection dialog
          setShowPersonSelectionDialog(true);
        }
      } else {
        // No person name provided, show selection dialog
        setShowPersonSelectionDialog(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, groupedPersonnel]);

  // Fetch submitted responses when component mounts or when groupedPersonnel changes
  useEffect(() => {
    if (groupedPersonnel.length > 0) {
      fetchSubmittedResponses();
    }
  }, [groupedPersonnel]);

  // Subscribe to changes in the form_responses table
  useEffect(() => {
    if (!supabase) return;
    
    console.log('Setting up subscription to form_responses table');
    
    let channel: RealtimeChannel | null = null;
    try {
      channel = supabase
        .channel('form_responses_changes')
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'form_responses',
            filter: `form_type=eq.ppe_check`
          }, 
          (payload) => {
            console.log('Detected change in form_responses table:', payload);
            fetchSubmittedResponses();
          }
        )
        .subscribe((status) => {
          console.log('Form responses subscription status:', status);
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error(`Form responses channel ${status}`);
          }
        });
    } catch (error) {
      console.error('Error setting up form_responses subscription:', error);
    }
      
    return () => {
      console.log('Cleaning up form_responses subscription');
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch (err) {
          console.warn('Error removing form_responses channel:', err);
        }
      }
    };
  }, [supabase]);

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center">Loading...</div>
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h1 className="text-2xl font-bold">PPE Check</h1>
          <div className="flex flex-wrap gap-2">
            {isMobile && (
              <Link href="/mobile-bookmarklet" passHref>
                <Button variant="outline" size="sm" className="flex items-center gap-1.5">
                  <Smartphone className="h-4 w-4" />
                  Mobile Bookmarklet
                </Button>
              </Link>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDialogOpen(true)}
              className="flex items-center gap-1.5"
            >
              <Bookmark className="h-4 w-4" />
              Bookmarklet Instructions
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowResetConfirmation(true)}
              className="flex items-center gap-1.5"
            >
              <FileCheck className="h-4 w-4" />
              Reset All Checks
            </Button>
          </div>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/equipment-checklist" passHref>
              <Button variant="outline" className="hidden sm:flex items-center gap-2">
                <Clipboard className="h-4 w-4" />
                Equipment Checklist
              </Button>
            </Link>
          </div>
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

        {/* Mobile Equipment Checklist Button */}
        <div className="sm:hidden">
          <Link href="/equipment-checklist" passHref>
            <Button variant="outline" className="w-full flex items-center justify-center gap-2">
              <Clipboard className="h-4 w-4" />
              Equipment Checklist
            </Button>
          </Link>
        </div>

        {/* Bookmarklet Instructions */}
        <BookmarkletInstructions />

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
                          className: "w-[15%]",
                          render: (value) => value || '-'
                        },
                        {
                          key: "vessel_cylinder",
                          header: "Vessel Cylinder",
                          className: "w-[15%]",
                          render: (value) => value || '-'
                        },
                        {
                          key: "lfav_backplate",
                          header: "LFAV Backplate",
                          className: "w-[15%]",
                          render: (value) => value || '-'
                        },
                        {
                          key: "lfav_cylinder",
                          header: "LFAV Cylinder",
                          className: "w-[15%]",
                          render: (value) => value || '-'
                        },
                        {
                          key: "actions",
                          header: "Actions",
                          className: "w-[20%]",
                          render: (_, person) => (
                            <div className="flex flex-row gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleFormFill(person)}
                                className="whitespace-nowrap"
                              >
                                <Copy className="h-4 w-4 mr-2" />
                                Fill Form
                              </Button>
                              <Button
                                variant={submittedResponses[person.name] ? "outline" : "default"}
                                size="sm"
                                onClick={() => {
                                  setSelectedPerson(person);
                                  if (submittedResponses[person.name]) {
                                    handleViewResponseId(person.name, submittedResponses[person.name]);
                                  } else {
                                    handleSubmitResponseId();
                                  }
                                }}
                                className={cn(
                                  "whitespace-nowrap",
                                  submittedResponses[person.name] 
                                    ? "border-blue-500 text-blue-500 hover:bg-blue-50"
                                    : "bg-green-600 hover:bg-green-700 text-white"
                                )}
                              >
                                {submittedResponses[person.name] ? (
                                  <>
                                    <FileCheck className="h-4 w-4 mr-2" />
                                    View ID
                                  </>
                                ) : (
                                  <>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Submit ID
                                  </>
                                )}
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
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="default"
                              onClick={() => handleFormFill(person)}
                              className="flex items-center justify-center h-10 flex-1"
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              Fill Form
                            </Button>
                            
                            <div className="relative flex-1">
                              <Button
                                variant={submittedResponses[person.name] ? "outline" : "default"}
                                size="default"
                                onClick={() => {
                                  setSelectedPerson(person);
                                  if (submittedResponses[person.name]) {
                                    handleViewResponseId(person.name, submittedResponses[person.name]);
                                  } else {
                                    handleSubmitResponseId();
                                  }
                                }}
                                className={cn(
                                  "flex items-center justify-center h-10 w-full",
                                  submittedResponses[person.name]
                                    ? "border-blue-500 text-blue-500 hover:bg-blue-50"
                                    : "bg-green-600 hover:bg-green-700 text-white"
                                )}
                              >
                                {submittedResponses[person.name] ? (
                                  <>
                                    <FileCheck className="h-4 w-4 mr-2" />
                                    View ID
                                  </>
                                ) : (
                                  <>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Submit ID
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
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
        
        {/* Dialog for response ID */}
        <Dialog open={isResponseIdDialogOpen} onOpenChange={setIsResponseIdDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Submit Response ID</DialogTitle>
              <DialogDescription>
                Enter the form response ID for {selectedPerson?.name}. This ID can be found at the end of the form submission confirmation page.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="space-y-2">
                <label htmlFor="response-id" className="text-sm font-medium">
                  Response ID
                </label>
                <Input
                  id="response-id"
                  placeholder="e.g., 65031149356d470012810f7f"
                  value={responseId}
                  onChange={(e) => setResponseId(e.target.value)}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  The response ID is a unique identifier for the form submission.
                </p>
          </div>
        </div>
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsResponseIdDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => saveResponseId()}
                disabled={!responseId}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog for viewing response ID */}
        <Dialog open={!!viewingResponseId} onOpenChange={(open) => !open && setViewingResponseId(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Submitted Response ID</DialogTitle>
              <DialogDescription>
                Response ID for {viewingPersonName}
              </DialogDescription>
            </DialogHeader>
            <div className="p-4 bg-muted/30 rounded-md font-mono text-sm break-all">
              {viewingResponseId}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setViewingResponseId(null)}
              >
                Close
              </Button>
              <Button
                type="button"
                onClick={async () => {
                  if (viewingResponseId) {
                    await navigator.clipboard.writeText(viewingResponseId);
                    toast({
                      title: "Copied!",
                      description: "Response ID copied to clipboard",
                    });
                  }
                }}
              >
                Copy ID
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reset button */}
        <div className="flex justify-end space-x-4 mt-4">
          <Button 
            onClick={() => setShowResetConfirmation(true)} 
            variant="destructive"
            className="flex items-center gap-2"
          >
            Reset Response ID
          </Button>
        </div>

        {/* Reset confirmation dialog */}
        <Dialog open={showResetConfirmation} onOpenChange={setShowResetConfirmation}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Reset</DialogTitle>
              <DialogDescription>
                {selectedPerson 
                  ? `Are you sure you want to reset the response ID for ${selectedPerson.name}?` 
                  : "Are you sure you want to reset ALL response IDs? This action cannot be undone."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex justify-between mt-4">
              <Button 
                onClick={() => setShowResetConfirmation(false)} 
                variant="outline"
              >
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  handleResetResponseId();
                  setShowResetConfirmation(false);
                }} 
                variant="destructive"
              >
                Reset
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog for submitted ID */}
        <Dialog open={!!submittedId}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submitted Response ID</DialogTitle>
              <DialogDescription>
                The response ID has been saved successfully.
              </DialogDescription>
            </DialogHeader>
            <div className="p-4 bg-muted/30 rounded-md font-mono text-sm break-all">
              {submittedId}
            </div>
            <DialogFooter className="flex justify-between">
              <Button onClick={() => setSubmittedId(null)} variant="outline">
                Close
              </Button>
              <Button
                onClick={async () => {
                  if (submittedId) {
                    await navigator.clipboard.writeText(submittedId);
                    toast({
                      title: "Copied!",
                      description: "Response ID copied to clipboard",
                    });
                  }
                }}
              >
                Copy ID
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog for person selection */}
        <Dialog open={showPersonSelectionDialog} onOpenChange={setShowPersonSelectionDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold text-gray-800">Select Personnel</DialogTitle>
              <DialogDescription className="text-sm text-gray-600">
                {tempPersonName ? 
                  `We couldn't find "${tempPersonName}" in the personnel list. Please select the correct person:` :
                  `Select the personnel for whom you want to save this response ID: ${tempResponseId}`
                }
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <label htmlFor="personnel-select" className="text-sm font-medium text-gray-700">
                  Personnel
                </label>
                <Select
                  onValueChange={(value) => {
                    const person = groupedPersonnel.find(p => p.name === value);
                    if (person) {
                      setSelectedPerson(person);
                    }
                  }}
                >
                  <SelectTrigger className="w-full bg-white border-gray-300 focus:ring-blue-500 focus:border-blue-500 font-sans">
                    <SelectValue placeholder="Select a person" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {groupingOrder.map((category) => {
                      const personnelInCategory = groupedPersonnel.filter(p => getCategory(p.grouping) === category);
                      if (!personnelInCategory.length) return null;
                      
                      return (
                        <React.Fragment key={category}>
                          <div className="px-2 py-1.5 text-xs font-medium text-gray-500">{category}</div>
                          {personnelInCategory.map((person) => (
                            <SelectItem 
                              key={person.name} 
                              value={person.name}
                              className="font-sans"
                            >
                              {person.name}
                            </SelectItem>
                          ))}
                          {category !== groupingOrder[groupingOrder.length - 1] && 
                            <div className="h-px my-1 bg-gray-200" />
                          }
                        </React.Fragment>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowPersonSelectionDialog(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (selectedPerson && tempResponseId) {
                    saveResponseIdForPerson(selectedPerson.name, tempResponseId);
                    setShowPersonSelectionDialog(false);
                    setTempResponseId(null);
                    setTempPersonName(null);
                  } else {
                    toast({
                      title: "Error",
                      description: "Please select a person",
                      variant: "destructive",
                    });
                  }
                }}
                disabled={!selectedPerson || !tempResponseId}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// Export the page component with Suspense boundary
export default function PPECheck() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
      <PPECheckClient />
    </Suspense>
  );
} 