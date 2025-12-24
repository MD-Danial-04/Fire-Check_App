'use client'

import { Bell, Settings, Search, Plus, ChevronDown, ChevronUp, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useEffect, useState } from 'react'
import { cn } from "@/lib/utils"
import { createClient } from '@supabase/supabase-js';
import { useToast } from "@/components/ui/use-toast"
// Note: Using global Toaster component in layout.tsx instead of local ToastProvider

// Add interfaces for props and data types
interface MetricCardProps {
  title: string;
  value: string;
  change: string;
  progress?: number;
  variant?: 'default' | 'attention';
}

interface ActivityItemProps {
  title: string;
  timestamp: string;
  type?: string;
  status?: string;
  section?: string;
  itemName?: string;
  personnel?: string;
  rawTimestamp?: number;
}

interface PendingItemProps {
  name: string;
  section?: string;
  type: 'ppe' | 'equipment';
  assignedTo?: string;
  role?: string;
  suggestedAssignee?: string;
  suggestedRole?: string;
}

// Add interface for BWC assignment
interface BwcAssignment {
  name: string;
  assigned_to: string;
}

// Add interface for BWC required personnel
interface BwcRequiredPerson {
  personnel: string;
  position: string;
  vehicle: string;
  required: boolean;
}

// Sample data for charts
const weeklyData = [
  { name: 'Mon', cylinders: 65, personnel: 45 },
  { name: 'Tue', cylinders: 72, personnel: 48 },
  { name: 'Wed', cylinders: 68, personnel: 42 },
  { name: 'Thu', cylinders: 75, personnel: 46 },
  { name: 'Fri', cylinders: 70, personnel: 44 },
  { name: 'Sat', cylinders: 63, personnel: 40 },
  { name: 'Sun', cylinders: 60, personnel: 38 },
]

const statusData = [
  { name: 'Active', value: 65 },
  { name: 'Maintenance', value: 15 },
  { name: 'Reserved', value: 20 },
]

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Add helper function before the Dashboard component
function normalizePersonnelName(name: string): string {
  if (!name) return '';
  
  // Convert to uppercase and trim
  let normalized = name.toUpperCase().trim();
  
  // First normalize the rank at the start of the name
  const rankRegex = /^(SGT|CPL|WO|LCP|CPT|LTA)[\s-]*\d*/i;
  normalized = normalized.replace(rankRegex, (match) => {
    // Extract just the basic rank without numbers
    const basicRank = match.match(/^(SGT|CPL|WO|LCP|CPT|LTA)/i)?.[0].toUpperCase() || match;
    return basicRank + ' '; // Add space after rank
  });

  // Remove multiple spaces and trim
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // Handle special cases like "CPT ALVIN / WO ANG"
  if (normalized.includes('/')) {
    return normalized;
  }
  
  // Split into parts and remove common words/particles
  const parts = normalized.split(' ');
  if (parts.length <= 1) return normalized;
  
  const rank = parts[0];
  const nameParts = parts.slice(1)
    .filter(part => !['BIN', 'BINTE', 'B', 'A/L', 'A/P'].includes(part));
  
  // Get first name (first part after rank)
  const firstName = nameParts[0];
  
  // Return both full normalized name and first name version for matching
  return `${rank} ${firstName}`;
}

export default function Dashboard() {
  const { toast } = useToast()
  const [isClient, setIsClient] = useState(false)
  const [ppeProgress, setPpeProgress] = useState({
    total: 0,
    completed: 0,
    inProgress: 0,
    pending: 0
  })
  const [equipmentProgress, setEquipmentProgress] = useState({
    armoury: {
      total: 0,
      completed: 0,
      inProgress: 0,
      pending: 0
    },
    vehicleFPT: {
      total: 0,
      completed: 0,
      inProgress: 0,
      pending: 0
    },
    bwc: {
      total: 0,
      completed: 0,
      inProgress: 0,
      pending: 0
    }
  })
  const [recentActivities, setRecentActivities] = useState<ActivityItemProps[]>([])
  const [pendingItems, setPendingItems] = useState<PendingItemProps[]>([])
  const [pendingItemsFilter, setPendingItemsFilter] = useState<'all' | 'equipment' | 'ppe'>('all')
  const [isPendingItemsExpanded, setIsPendingItemsExpanded] = useState(true)
  const [isRecentActivityExpanded, setIsRecentActivityExpanded] = useState(true)
  const [isViewAllActivity, setIsViewAllActivity] = useState(false)
  const [ppeStatusView, setPpeStatusView] = useState<'completed' | 'pending' | 'none'>('none')
  const [completedPersonnel, setCompletedPersonnel] = useState<PendingItemProps[]>([])
  // Add new state for equipment sections
  const [equipmentSectionView, setEquipmentSectionView] = useState<'armoury' | 'vehicleFPT' | 'bwc' | 'none'>('none')
  const [equipmentSectionItems, setEquipmentSectionItems] = useState<{
    armoury: { completed: PendingItemProps[], pending: PendingItemProps[] },
    vehicleFPT: { completed: PendingItemProps[], pending: PendingItemProps[] },
    bwc: { completed: PendingItemProps[], pending: PendingItemProps[] }
  }>({
    armoury: { completed: [], pending: [] },
    vehicleFPT: { completed: [], pending: [] },
    bwc: { completed: [], pending: [] }
  })

  // Add state for BWC personnel tracking
  const [bwcPersonnel, setBwcPersonnel] = useState<{
    personnel: string;
    position: string;
    vehicle: string;
    hasBwc: boolean;
    bwcSerial?: string;
    required: boolean;
  }[]>([])

  const [isScraperRunning, setIsScraperRunning] = useState(false)

  useEffect(() => {
    setIsClient(true)

    // Fetch PPE check data from form_responses and personnel tables
    const fetchPpeData = async () => {
      try {
        // 1. Get all personnel who should submit PPE checks
        const { data: personnelData, error: personnelError } = await supabase
          .from('personnel_ba_view')
          .select('personnel_name');

        if (personnelError) {
          console.error('Error fetching personnel data:', personnelError);
          return;
        }

        // Helper function to check if names match (either exact or first name)
        const namesMatch = (name1: string, name2: string) => {
          const norm1 = normalizePersonnelName(name1);
          const norm2 = normalizePersonnelName(name2);
          
          // Check if either normalized version matches
          return norm1 === norm2;
        };

        // Create a map of normalized names to original names to handle duplicates
        const personnelMap = new Map();
        personnelData?.forEach(person => {
          if (person.personnel_name) {
            const normalizedName = normalizePersonnelName(person.personnel_name);
            // Keep the most complete version of the name (usually the longer one)
            if (!personnelMap.has(normalizedName) || 
                person.personnel_name.length > personnelMap.get(normalizedName).length) {
              personnelMap.set(normalizedName, person.personnel_name);
            }
          }
        });
        
        const total = personnelMap.size;

        // 2. Get submitted form responses for PPE checks
        const { data: responseData, error: responseError } = await supabase
          .from('form_responses')
          .select('personnel_name, submitted_at, response_id')
          .eq('form_type', 'ppe_check')
          .order('submitted_at', { ascending: false });

        if (responseError) {
          console.error('Error fetching form responses:', responseError);
          return;
        }

        // 3. Calculate progress metrics with normalized names
        // Create a map of personnel to their most recent submission
        const submissionMap = new Map();
        responseData?.forEach(response => {
          const normalizedName = normalizePersonnelName(response.personnel_name);
          if (!submissionMap.has(normalizedName)) {
            submissionMap.set(normalizedName, {
              submitted_at: response.submitted_at,
              response_id: response.response_id,
              original_name: response.personnel_name
            });
          }
        });
        
        // Count only unique personnel who have submitted
        const completed = submissionMap.size;
        const pending = total - completed;

        console.log(`PPE Progress: ${completed}/${total} completed, ${pending} pending`);
        setPpeProgress({ total, completed, inProgress: 0, pending });

        // Track completed personnel for PPE checks
        const completedPersonnelList: PendingItemProps[] = [];
        submissionMap.forEach((data, normalizedName) => {
          // Use the original name from personnel map if available
          const displayName = personnelMap.get(normalizedName) || data.original_name;
          completedPersonnelList.push({
            name: displayName,
            type: 'ppe'
          });
        });
        setCompletedPersonnel(completedPersonnelList);

        // Add debug logging for personnel map
        console.log('Personnel Map after normalization:');
        personnelMap.forEach((originalName, normalizedName) => {
          console.log(`${originalName} -> ${normalizedName}`);
        });

        // Add debug logging for submission map
        console.log('Submission Map after normalization:');
        submissionMap.forEach((data, normalizedName) => {
          console.log(`${data.original_name} -> ${normalizedName}`);
        });

        // Track pending personnel for PPE checks with debug logging
        const pendingPersonnel: PendingItemProps[] = [];
        personnelMap.forEach((originalName, normalizedName) => {
          // Check if this person has submitted (using first name matching)
          const hasSubmitted = Array.from(submissionMap.keys()).some(submittedName => 
            namesMatch(submittedName, normalizedName)
          );
          
          console.log(`Checking ${originalName} (${normalizedName}): ${hasSubmitted ? 'submitted' : 'pending'}`);
          
          if (!hasSubmitted) {
            pendingPersonnel.push({
              name: originalName,
              type: 'ppe'
            });
          }
        });

        // Update pending items state with PPE pending personnel
        setPendingItems(prevItems => {
          const equipmentItems = prevItems.filter(item => item.type === 'equipment');
          return [...equipmentItems, ...pendingPersonnel];
        });

        // 4. Update recent activities
        if (responseData && responseData.length > 0) {
          // Use normalized names for grouping but original names for display
          const uniqueSubmissions = Array.from(submissionMap.entries()).map(([normalizedName, data]) => ({
            personnel_name: personnelMap.get(normalizedName) || data.original_name,
            submitted_at: data.submitted_at
          }));
          
          // Sort by submission time (most recent first)
          uniqueSubmissions.sort((a, b) => 
            new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
          );
          
          const recentSubmissions = uniqueSubmissions.slice(0, 20).map(submission => {
            const submittedAt = new Date(submission.submitted_at);
            const now = new Date();
            const diffMs = now.getTime() - submittedAt.getTime();
            const diffMins = Math.round(diffMs / 60000);
            const diffHours = Math.round(diffMs / 3600000);
            const diffDays = Math.round(diffMs / 86400000);
            
            let timeAgo;
            if (diffMins < 60) {
              timeAgo = `${diffMins} ${diffMins === 1 ? 'min' : 'mins'} ago`;
            } else if (diffHours < 24) {
              timeAgo = `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
            } else {
              timeAgo = `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
            }
            
            return {
              title: `PPE Check submitted by ${submission.personnel_name}`,
              timestamp: timeAgo,
              type: 'ppe',
              personnel: submission.personnel_name,
              status: 'submitted',
              rawTimestamp: submittedAt.getTime()
            };
          });
          
          setRecentActivities(prevActivities => {
            // Combine with any equipment check activities
            const combinedActivities = [...recentSubmissions, ...prevActivities.filter(a => a.type === 'equipment')];
            
            // Sort by raw timestamp (most recent first)
            combinedActivities.sort((a, b) => {
              if (a.rawTimestamp && b.rawTimestamp) {
                return b.rawTimestamp - a.rawTimestamp;
              }
              
              const aTime = a.timestamp.match(/(\d+)/);
              const bTime = b.timestamp.match(/(\d+)/);
              if (!aTime || !bTime) return 0;
              return parseInt(bTime[0]) - parseInt(aTime[0]);
            });
            
            return combinedActivities;
          });
        }
      } catch (error) {
        console.error('Error in fetchPpeData:', error);
      }
    };

    // Fetch equipment checklist data
    const fetchEquipmentData = async () => {
      try {
        // Get all equipment checklist items
        const { data: checklistData, error: checklistError } = await supabase
          .from('equipment_checklist')
          .select('*');

        if (checklistError) {
          console.error('Error fetching equipment checklist:', checklistError);
          return;
        }

        // Get personnel who should have BWCs
        const { data: personnelData, error: personnelError } = await supabase
          .from('personnel_ba_view')
          .select('personnel_name, vehicle_type, section, position');

        if (personnelError) {
          console.error('Error fetching personnel data:', personnelError);
        }

        // Identify the personnel who need BWCs, including ENG/EMT for MRV811
        const bwcRequiredPositions = [
          { vehicle: 'MRV811', position: 'Duty Officer', required: true },
          { vehicle: 'MRV811', position: 'ENG/EMT', required: true },
          { vehicle: 'MRV811', position: 'NAV SPEC', required: false }, // Conditional, depends on personnel assignments
          { vehicle: 'LF811', position: 'SC', required: true },
          { vehicle: 'LF811', position: 'PO', required: true },
          { vehicle: 'LF812', position: 'SC', required: true },
          { vehicle: 'LF812', position: 'PO', required: true },
        ];

        // Find personnel matching these positions
        const bwcRequiredPersonnel = bwcRequiredPositions.map(req => {
          // Find matching personnel
          const person = personnelData?.find(p => 
            (p.vehicle_type === req.vehicle && p.position === req.position) ||
            // Special case for Duty Officer which might be in COMMAND section
            (req.position === 'Duty Officer' && p.position === 'Duty Officer')
          );
          
          return {
            personnel: person?.personnel_name || `${req.vehicle} ${req.position}`,
            position: req.position,
            vehicle: req.vehicle,
            hasBwc: false,
            bwcSerial: undefined,
            required: req.required
          };
        });

        // Group items by section
        const sections = {
          armoury: checklistData?.filter(item => item.section.toUpperCase() === 'ARMOURY') || [],
          vehicleFPT: checklistData?.filter(item => item.section.toUpperCase() === 'VEHICLE FPT') || [],
          bwc: checklistData?.filter(item => item.section.toUpperCase() === 'BWC') || []
        };

        // Check which BWCs are assigned and to whom
        const assignedBwcs: BwcAssignment[] = sections.bwc.filter(item => item.checked && item.assigned_to) || [];
        
        // Update BWC personnel tracking
        const updatedBwcPersonnel = bwcRequiredPersonnel.map(person => {
          // Check if this person has a BWC assigned
          const assignedBwc = assignedBwcs.find(bwc => {
            // Normalize both names for comparison
            const normalizedAssignedTo = normalizePersonnelName(bwc.assigned_to);
            const normalizedPersonnel = normalizePersonnelName(person.personnel);
            return normalizedAssignedTo === normalizedPersonnel;
          });
          
          return {
            personnel: person.personnel,
            position: person.position,
            vehicle: person.vehicle,
            hasBwc: !!assignedBwc,
            bwcSerial: assignedBwc?.name,
            required: person.required
          };
        });
        
        setBwcPersonnel(updatedBwcPersonnel);

        // Count unique personnel for logging purposes
        const uniquePersonnel = new Set<string>();
        bwcRequiredPersonnel.forEach(person => {
          if (person.personnel) {
            uniquePersonnel.add(person.personnel);
          }
        });

        // Calculate progress for each section
        const progress = {
          armoury: calculateSectionProgress(sections.armoury),
          vehicleFPT: calculateSectionProgress(sections.vehicleFPT),
          // Special handling for BWC
          bwc: calculateBwcProgress(sections.bwc, assignedBwcs, uniquePersonnel, bwcRequiredPersonnel)
        };

        setEquipmentProgress(progress);
        console.log('Equipment progress updated:', progress);

        // Track equipment items by section for detailed view
        const sectionItems = {
          armoury: {
            completed: sections.armoury
              .filter(item => item.checked)
              .map(item => ({
                name: item.name,
                section: 'Armoury',
                type: 'equipment' as const,
                assignedTo: item.assigned_to
              })),
            pending: sections.armoury
              .filter(item => !item.checked)
              .map(item => ({
                name: item.name,
                section: 'Armoury',
                type: 'equipment' as const
              }))
          },
          vehicleFPT: {
            completed: sections.vehicleFPT
              .filter(item => item.checked)
              .map(item => ({
                name: item.name,
                section: 'Vehicle FPT',
                type: 'equipment' as const,
                assignedTo: item.assigned_to
              })),
            pending: sections.vehicleFPT
              .filter(item => !item.checked)
              .map(item => ({
                name: item.name,
                section: 'Vehicle FPT',
                type: 'equipment' as const
              }))
          },
          bwc: {
            completed: sections.bwc
              .filter(item => item.checked)
              .map(item => ({
                name: item.name,
                section: 'BWC',
                type: 'equipment' as const,
                assignedTo: item.assigned_to,
                // Add role information for BWC items
                role: updatedBwcPersonnel.find(p => p.personnel === item.assigned_to)?.position
              })),
            pending: updatedBwcPersonnel
              .filter(person => !person.hasBwc && person.required)
              .map(person => ({
                name: person.personnel,
                section: 'BWC',
                type: 'equipment' as const,
                suggestedAssignee: person.personnel,
                suggestedRole: `${person.vehicle} ${person.position}`
              }))
          }
        };
        
        setEquipmentSectionItems(sectionItems);

        // Track pending equipment items
        const pendingEquipment: PendingItemProps[] = [];
        
        // Add pending armoury items
        sections.armoury
          .filter(item => !item.checked)
          .forEach(item => {
            pendingEquipment.push({
              name: item.name,
              section: 'Armoury',
              type: 'equipment'
            });
          });
          
        // Add pending vehicle FPT items
        sections.vehicleFPT
          .filter(item => !item.checked)
          .forEach(item => {
            pendingEquipment.push({
              name: item.name,
              section: 'Vehicle FPT',
              type: 'equipment'
            });
          });
          
        // Add pending BWC items (show all unchecked BWCs)
          sections.bwc
            .filter(item => !item.checked)
            .forEach(item => {
              pendingEquipment.push({
                name: item.name,
                section: 'BWC',
                type: 'equipment'
              });
            });

        // Update pending items state with equipment pending items
        setPendingItems(prevItems => {
          // Filter out any previous equipment items
          const ppeItems = prevItems.filter(item => item.type === 'ppe');
          return [...ppeItems, ...pendingEquipment];
        });

        // Update recent activities with equipment check updates
        const recentUpdates = checklistData
          ?.filter(item => item.updated_at && (item.checked || item.assigned_to)) // Only show meaningful updates
          ?.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
          ?.slice(0, 20) // Get more items for "View All"
          ?.map(item => {
            const updatedAt = new Date(item.updated_at);
            const now = new Date();
            const diffMs = now.getTime() - updatedAt.getTime();
            const diffMins = Math.round(diffMs / 60000);
            const diffHours = Math.round(diffMs / 3600000);
            const diffDays = Math.round(diffMs / 86400000);
            
            let timeAgo;
            if (diffMins < 60) {
              timeAgo = `${diffMins} ${diffMins === 1 ? 'min' : 'mins'} ago`;
            } else if (diffHours < 24) {
              timeAgo = `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
            } else {
              timeAgo = `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
            }
            
            // Create more meaningful activity descriptions
            let title = '';
            if (item.checked && item.assigned_to) {
              title = `${item.section} - ${item.name} completed by ${item.assigned_to}`;
            } else if (item.checked) {
              title = `${item.section} - ${item.name} marked as complete`;
            } else if (item.assigned_to) {
              title = `${item.section} - ${item.name} assigned to ${item.assigned_to}`;
            } else {
              title = `${item.section} - ${item.name} updated`;
            }
            
            return {
              title,
              timestamp: timeAgo,
              type: 'equipment',
              section: item.section,
              itemName: item.name,
              status: item.checked ? 'completed' : (item.assigned_to ? 'assigned' : 'updated'),
              rawTimestamp: updatedAt.getTime()
            };
          }) || [];

        setRecentActivities(prevActivities => {
          // Combine with any PPE check activities
          const combinedActivities = [...recentUpdates, ...prevActivities.filter(a => a.type === 'ppe')];
          
          // Sort by raw timestamp (most recent first)
          combinedActivities.sort((a, b) => {
            if (a.rawTimestamp && b.rawTimestamp) {
              return b.rawTimestamp - a.rawTimestamp;
            }
            
            const aTime = a.timestamp.match(/(\d+)/);
            const bTime = b.timestamp.match(/(\d+)/);
            if (!aTime || !bTime) return 0;
            return parseInt(bTime[0]) - parseInt(aTime[0]);
          });
          
          return combinedActivities;
        });
      } catch (error) {
        console.error('Error in fetchEquipmentData:', error);
      }
    };

    // Helper function to calculate progress for a section
    const calculateSectionProgress = (items: any[]) => {
      const total = items.length;
      const completed = items.filter(item => item.checked).length;
      // We're removing in-progress tracking as requested
      const pending = total - completed;
      
      return { total, completed, inProgress: 0, pending };
    };

    // Special helper function for BWC progress
    const calculateBwcProgress = (items: any[], assignedBwcs: any[], uniquePersonnel: Set<string>, personnelList: any[]) => {
      // Count unique personnel who have BWCs assigned
      const assignedPersonnel = new Set<string>();
      assignedBwcs.forEach(bwc => {
        if (bwc.assigned_to) {
          assignedPersonnel.add(bwc.assigned_to);
        }
      });
      
      const uniqueCompleted = assignedPersonnel.size;
      
      // Check if same person is assigned as both ENG/EMT in MRV811 and PO in LF811
      const engEmtPerson = personnelList.find(p => p.vehicle === 'MRV811' && p.position === 'ENG/EMT')?.personnel;
      const lf811PoPerson = personnelList.find(p => p.vehicle === 'LF811' && p.position === 'PO')?.personnel;
      
      // If the same person is assigned as both ENG/EMT and LF811 PO, NAV SPEC needs BWC
      // Otherwise NAV SPEC doesn't need BWC
      const sharedRole = engEmtPerson && lf811PoPerson && engEmtPerson === lf811PoPerson;
      
      // Update NAV SPEC required status
      const navSpecIndex = personnelList.findIndex(p => p.vehicle === 'MRV811' && p.position === 'NAV SPEC');
      if (navSpecIndex >= 0) {
        personnelList[navSpecIndex].required = sharedRole;
      }
      
      // Always need 6 BWCs total - fixed requirement as specified
      const targetChecks = 6;
      
      // Calculate effective completion
      const effectiveCompleted = Math.min(uniqueCompleted, targetChecks);
      const effectivePending = targetChecks - effectiveCompleted;
      
      console.log(`BWC Progress: ${uniqueCompleted}/${uniquePersonnel.size} unique personnel have BWCs, ${effectiveCompleted}/${targetChecks} effective completion`);
      console.log(`Same person as ENG/EMT and LF811 PO: ${sharedRole}, NAV SPEC needs BWC: ${sharedRole}`);
      
      return { 
        total: targetChecks,
        completed: effectiveCompleted,
        inProgress: 0,
        pending: effectivePending
      };
    };

    // Initial data fetch
    fetchPpeData();
    fetchEquipmentData();

    // Set up real-time subscription for form_responses
    const formResponsesSubscription = supabase
      .channel('form-responses-changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'form_responses',
        filter: 'form_type=eq.ppe_check'
      }, payload => {
        console.log('Form response change detected:', payload);
        fetchPpeData();
      })
      .subscribe(status => {
        console.log('Form responses subscription status:', status);
      });

    // Set up real-time subscription for equipment_checklist
    const equipmentChecklistSubscription = supabase
      .channel('equipment-checklist-changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'equipment_checklist'
      }, payload => {
        console.log('Equipment checklist change detected:', payload);
        fetchEquipmentData();
      })
      .subscribe(status => {
        console.log('Equipment checklist subscription status:', status);
      });

    // Cleanup subscriptions on unmount
    return () => {
      supabase.removeChannel(formResponsesSubscription);
      supabase.removeChannel(equipmentChecklistSubscription);
    };
  }, [])

  if (!isClient) {
    return null
  }

  // Calculate percentages for progress bars
  const calculateProgress = (completed: number, total: number) => {
    return total > 0 ? Math.round((completed / total) * 100) : 0;
  }

  // Add function to run the scraper
  const runScraper = async () => {
    try {
      setIsScraperRunning(true)
      
      // Call the API
      const response = await fetch('/api/run-scraper', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      const data = await response.json()
      
      if (response.ok) {
        toast({
          title: "Scraper completed",
          description: `Successfully processed ${data.details?.itemsProcessed || 0} items.`,
        })
      } else {
        throw new Error(data.error || 'Failed to run scraper')
      }
    } catch (error) {
      toast({
        title: "Error running scraper",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive"
      })
    } finally {
      setIsScraperRunning(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="border-b border-neutral-100 bg-white">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4 flex-1">
            <h1 className="text-xl font-semibold">Duty Manning Dashboard</h1>
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

      {/* Dashboard Content */}
      <main className="flex-1 overflow-auto p-3 sm:p-6 bg-gray-50 dark:bg-[#1c1917]">
        <div className="mx-auto max-w-7xl space-y-3 sm:space-y-6">
          {/* Top Level Metrics */}
          <div className="grid gap-3 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="PPE Check Status"
              value={`${ppeProgress.completed}/${ppeProgress.total}`}
              change={`${calculateProgress(ppeProgress.completed, ppeProgress.total)}% complete`}
              progress={calculateProgress(ppeProgress.completed, ppeProgress.total)}
            />
            <MetricCard
              title="Equipment Check Status"
              value={`${
                equipmentProgress.armoury.completed + 
                equipmentProgress.vehicleFPT.completed + 
                equipmentProgress.bwc.completed
              }/${
                equipmentProgress.armoury.total + 
                equipmentProgress.vehicleFPT.total + 
                equipmentProgress.bwc.total
              }`}
              change={`${calculateProgress(
                equipmentProgress.armoury.completed + 
                equipmentProgress.vehicleFPT.completed + 
                equipmentProgress.bwc.completed,
                equipmentProgress.armoury.total + 
                equipmentProgress.vehicleFPT.total + 
                equipmentProgress.bwc.total
              )}% complete`}
              progress={calculateProgress(
                equipmentProgress.armoury.completed + 
                equipmentProgress.vehicleFPT.completed + 
                equipmentProgress.bwc.completed,
                equipmentProgress.armoury.total + 
                equipmentProgress.vehicleFPT.total + 
                equipmentProgress.bwc.total
              )}
            />
            <MetricCard
              title="Total Tasks Pending"
              value={`${
                ppeProgress.pending + 
                equipmentProgress.armoury.pending + 
                equipmentProgress.vehicleFPT.pending + 
                equipmentProgress.bwc.pending
              }`}
              change="Needs attention"
              variant="attention"
            />
            <MetricCard
              title="Last Update"
              value={recentActivities.length > 0 ? recentActivities[0].timestamp : "N/A"}
              change={recentActivities.length > 0 ? recentActivities[0].title.split(' - ')[0] : "No recent activity"}
            />
          </div>

          {/* Equipment Check Progress */}
          <div className="grid gap-3 sm:gap-6 grid-cols-1 lg:grid-cols-2">
            <Card className="border-gray-200 dark:border-neutral-700 dark:bg-neutral-800">
              <CardHeader className="px-4 py-2.5 sm:px-6 sm:py-4 border-b border-gray-100 dark:border-neutral-700">
                <div className="flex items-center justify-between w-full">
                  <CardTitle className="text-base font-semibold dark:text-neutral-100">Equipment Check Status</CardTitle>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 sm:h-8 text-xs sm:text-sm dark:text-neutral-100 dark:border-neutral-700 dark:bg-neutral-700 dark:hover:bg-neutral-600"
                    disabled={isScraperRunning}
                    onClick={runScraper}
                  >
                    {isScraperRunning ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Running...
                      </>
                    ) : (
                      'Update Armoury'
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 py-3 sm:px-6 sm:py-6">
                <div className="space-y-3 sm:space-y-6">
                  <ProgressSection
                    title="Armoury"
                    total={equipmentProgress.armoury.total}
                    completed={equipmentProgress.armoury.completed}
                    inProgress={0}
                    pending={equipmentProgress.armoury.pending}
                    sectionKey="armoury"
                    isSelected={equipmentSectionView === 'armoury'}
                    onSectionClick={(section) => setEquipmentSectionView(equipmentSectionView === section ? 'none' : section)}
                  />
                  {equipmentSectionView === 'armoury' && (
                    <div className="mt-2 border-t border-gray-200 dark:border-neutral-700 pt-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-neutral-300 mb-2">
                            Completed Items ({equipmentSectionItems.armoury.completed.length})
                          </h4>
                          <div className="space-y-2">
                            {equipmentSectionItems.armoury.completed.length > 0 ? (
                              equipmentSectionItems.armoury.completed.map((item, index) => (
                                <div key={`armoury-completed-${index}`} className="border border-gray-200 dark:border-neutral-700 rounded-md dark:bg-neutral-700 p-2">
                                  <div className="flex flex-col">
                                    <div className="flex items-center">
                                      <div className="h-2 w-2 rounded-full mr-2 bg-green-500" aria-hidden="true"></div>
                                      <div className="text-sm font-medium">{item.name}</div>
                                    </div>
                                    {item.assignedTo && (
                                      <div className="mt-1 ml-4 text-xs text-neutral-500 dark:text-neutral-400">
                                        Assigned to: {item.assignedTo}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-sm text-gray-500 dark:text-neutral-400">No completed items</div>
                            )}
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-neutral-300 mb-2">
                            Pending Items ({equipmentSectionItems.armoury.pending.length})
                          </h4>
                          <div className="space-y-2">
                            {equipmentSectionItems.armoury.pending.length > 0 ? (
                              equipmentSectionItems.armoury.pending.map((item, index) => (
                                <div key={`armoury-pending-${index}`} className="border border-gray-200 dark:border-neutral-700 rounded-md dark:bg-neutral-700 p-2">
                                  <div className="flex items-center">
                                    <div className="h-2 w-2 rounded-full mr-2 bg-red-500" aria-hidden="true"></div>
                                    <div className="text-sm">{item.name}</div>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-sm text-gray-500 dark:text-neutral-400">No pending items</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <ProgressSection
                    title="Vehicle FPT"
                    total={equipmentProgress.vehicleFPT.total}
                    completed={equipmentProgress.vehicleFPT.completed}
                    inProgress={0}
                    pending={equipmentProgress.vehicleFPT.pending}
                    sectionKey="vehicleFPT"
                    isSelected={equipmentSectionView === 'vehicleFPT'}
                    onSectionClick={(section) => setEquipmentSectionView(equipmentSectionView === section ? 'none' : section)}
                  />
                  {equipmentSectionView === 'vehicleFPT' && (
                    <div className="mt-2 border-t border-gray-200 dark:border-neutral-700 pt-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-neutral-300 mb-2">
                            Completed Items ({equipmentSectionItems.vehicleFPT.completed.length})
                          </h4>
                          <div className="space-y-2">
                            {equipmentSectionItems.vehicleFPT.completed.length > 0 ? (
                              equipmentSectionItems.vehicleFPT.completed.map((item, index) => (
                                <div key={`vehicleFPT-completed-${index}`} className="border border-gray-200 dark:border-neutral-700 rounded-md dark:bg-neutral-700 p-2">
                                  <div className="flex flex-col">
                                    <div className="flex items-center">
                                      <div className="h-2 w-2 rounded-full mr-2 bg-green-500" aria-hidden="true"></div>
                                      <div className="text-sm font-medium">{item.name}</div>
                                    </div>
                                    {item.assignedTo && (
                                      <div className="mt-1 ml-4 text-xs text-neutral-500 dark:text-neutral-400">
                                        Assigned to: {item.assignedTo}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-sm text-gray-500 dark:text-neutral-400">No completed items</div>
                            )}
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-neutral-300 mb-2">
                            Pending Items ({equipmentSectionItems.vehicleFPT.pending.length})
                          </h4>
                          <div className="space-y-2">
                            {equipmentSectionItems.vehicleFPT.pending.length > 0 ? (
                              equipmentSectionItems.vehicleFPT.pending.map((item, index) => (
                                <div key={`vehicleFPT-pending-${index}`} className="border border-gray-200 dark:border-neutral-700 rounded-md dark:bg-neutral-700 p-2">
                                  <div className="flex items-center">
                                    <div className="h-2 w-2 rounded-full mr-2 bg-red-500" aria-hidden="true"></div>
                                    <div className="text-sm">{item.name}</div>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-sm text-gray-500 dark:text-neutral-400">No pending items</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <ProgressSection
                    title="BWC"
                    total={equipmentProgress.bwc.total}
                    completed={equipmentProgress.bwc.completed}
                    inProgress={0}
                    pending={equipmentProgress.bwc.pending}
                    sectionKey="bwc"
                    isSelected={equipmentSectionView === 'bwc'}
                    onSectionClick={(section) => setEquipmentSectionView(equipmentSectionView === section ? 'none' : section)}
                  />
                  {equipmentSectionView === 'bwc' && (
                    <div className="mt-2 border-t border-gray-200 dark:border-neutral-700 pt-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-neutral-300 mb-2">
                            Completed Items ({equipmentSectionItems.bwc.completed.length})
                          </h4>
                          <div className="space-y-2">
                            {equipmentSectionItems.bwc.completed.length > 0 ? (
                              equipmentSectionItems.bwc.completed.map((item, index) => (
                                <div key={`bwc-completed-${index}`} className="border border-gray-200 dark:border-neutral-700 rounded-md dark:bg-neutral-700 p-2">
                                  <div className="flex flex-col">
                                    <div className="flex items-center">
                                      <div className="h-2 w-2 rounded-full mr-2 bg-green-500" aria-hidden="true"></div>
                                      <div className="text-sm font-medium">{item.name}</div>
                                    </div>
                                    {item.assignedTo && (
                                      <div className="mt-1 ml-4 text-xs text-neutral-500 dark:text-neutral-400">
                                        Assigned to: {item.assignedTo} {item.role ? `(${item.role})` : ''}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-sm text-gray-500 dark:text-neutral-400">No completed items</div>
                            )}
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-neutral-300 mb-2">
                            Required Positions
                          </h4>
                          <div className="space-y-2">
                            {/* Only display personnel who are required but don't have BWCs assigned yet */}
                            {(() => {
                              // Check if ENG/EMT and LF811 PO are the same person
                              const engEmtPerson = bwcPersonnel.find(p => p.vehicle === 'MRV811' && p.position === 'ENG/EMT')?.personnel;
                              const lf811PoPerson = bwcPersonnel.find(p => p.vehicle === 'LF811' && p.position === 'PO')?.personnel;
                              const sharedRole = engEmtPerson && lf811PoPerson && engEmtPerson === lf811PoPerson;
                              
                              // Get all required personnel
                              let requiredPersonnel = bwcPersonnel.filter(person => 
                                person.required || (person.vehicle === 'MRV811' && person.position === 'NAV SPEC' && sharedRole === true)
                              );
                              
                              // Filter to only required personnel without BWCs
                              const remainingPersonnel = requiredPersonnel.filter(person => !person.hasBwc);
                              
                              return remainingPersonnel.length > 0 ? (
                                remainingPersonnel.map((person, index) => (
                                  <div 
                                    key={`bwc-personnel-${index}`} 
                                    className="border border-gray-200 dark:border-neutral-700 rounded-md dark:bg-neutral-700 p-2"
                                  >
                                    <div className="flex flex-col">
                                      <div className="flex items-center">
                                        <div className="h-2 w-2 rounded-full mr-2 bg-red-500" aria-hidden="true"></div>
                                        <div className="text-sm font-medium">{person.personnel}</div>
                                      </div>
                                      <div className="mt-1 ml-4 text-xs text-neutral-500 dark:text-neutral-400">
                                        {person.vehicle} {person.position}
                                      </div>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="text-sm text-gray-500 dark:text-neutral-400">All required positions have BWCs assigned</div>
                              );
                            })()}
                          </div>
                          <div className="mt-4 text-xs text-gray-500 dark:text-neutral-400 italic">
                            Note: Always 6 BWCs required. {
                              bwcPersonnel.find(p => p.vehicle === 'MRV811' && p.position === 'ENG/EMT')?.personnel === 
                              bwcPersonnel.find(p => p.vehicle === 'LF811' && p.position === 'PO')?.personnel
                              ? "NAV SPEC needs BWC because the same person is assigned as both MRV811 ENG/EMT and LF811 PO."
                              : "NAV SPEC doesn't need BWC because different people are assigned to MRV811 ENG/EMT and LF811 PO."
                            }
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 dark:border-neutral-700 dark:bg-neutral-800">
              <CardHeader className="px-4 py-2.5 sm:px-6 sm:py-4 border-b border-gray-100 dark:border-neutral-700">
                <CardTitle className="text-base font-semibold dark:text-neutral-100">PPE Check Status</CardTitle>
              </CardHeader>
              <CardContent className="px-4 py-3 sm:px-6 sm:py-6">
                <div className="space-y-3 sm:space-y-6">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm dark:text-neutral-300">
                      <span>Overall Progress</span>
                      <span className="font-medium">{calculateProgress(ppeProgress.completed, ppeProgress.total)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-neutral-700 overflow-hidden">
                      <div 
                        className="h-full bg-green-500 rounded-full"
                        style={{ width: `${calculateProgress(ppeProgress.completed, ppeProgress.total)}%` }}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 sm:gap-4 pt-2 sm:pt-4">
                    <div 
                      className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-card dark:bg-neutral-700 p-2 sm:p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-600 transition-colors relative group"
                      onClick={() => setPpeStatusView(ppeStatusView === 'completed' ? 'none' : 'completed')}
                    >
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {ppeStatusView === 'completed' ? 
                          <Minimize2 className="h-4 w-4 text-green-500" /> : 
                          <Maximize2 className="h-4 w-4 text-green-500" />
                        }
                      </div>
                      <div className="text-2xl sm:text-3xl font-bold text-green-500 dark:text-green-400">{ppeProgress.completed}</div>
                      <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground dark:text-neutral-400">Completed</div>
                        <ChevronDown className={`h-4 w-4 text-neutral-400 transition-transform ${ppeStatusView === 'completed' ? 'rotate-180' : ''}`} />
                    </div>
                    </div>
                    <div 
                      className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-card dark:bg-neutral-700 p-2 sm:p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-600 transition-colors relative group"
                      onClick={() => setPpeStatusView(ppeStatusView === 'pending' ? 'none' : 'pending')}
                    >
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {ppeStatusView === 'pending' ? 
                          <Minimize2 className="h-4 w-4 text-red-500" /> : 
                          <Maximize2 className="h-4 w-4 text-red-500" />
                        }
                      </div>
                      <div className="text-2xl sm:text-3xl font-bold text-red-500 dark:text-red-400">{ppeProgress.pending}</div>
                      <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground dark:text-neutral-400">Pending</div>
                        <ChevronDown className={`h-4 w-4 text-neutral-400 transition-transform ${ppeStatusView === 'pending' ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
          </div>

                  {/* Show personnel list based on selected view */}
                  {ppeStatusView !== 'none' && (
                    <div className="mt-4 border-t border-gray-200 dark:border-neutral-700 pt-4">
                      <h3 className="text-sm font-medium text-gray-700 dark:text-neutral-300 mb-3">
                        {ppeStatusView === 'completed' ? 'Completed Personnel' : 'Pending Personnel'} ({ppeStatusView === 'completed' ? completedPersonnel.length : pendingItems.filter(item => item.type === 'ppe').length})
                              </h3>
                      <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                        {ppeStatusView === 'completed' ? (
                          completedPersonnel.length > 0 ? (
                            completedPersonnel.map((person, index) => (
                              <div key={`completed-${index}`} className="border border-gray-200 dark:border-neutral-700 rounded-md dark:bg-neutral-700">
                                    <div className="flex items-center p-2">
                                  <div className="h-2 w-2 rounded-full mr-3 bg-green-500" aria-hidden="true"></div>
                                      <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate dark:text-neutral-200">{person.name}</p>
                                      </div>
                                    </div>
                                  </div>
                            ))
                          ) : (
                            <div className="text-center py-2 text-muted-foreground dark:text-neutral-400 col-span-2">
                              No completed PPE checks found
                              </div>
                          )
                        ) : (
                          pendingItems.filter(item => item.type === 'ppe').length > 0 ? (
                            pendingItems.filter(item => item.type === 'ppe').map((person, index) => (
                              <div key={`pending-${index}`} className="border border-gray-200 dark:border-neutral-700 rounded-md dark:bg-neutral-700">
                                <div className="flex items-center p-2">
                                  <div className="h-2 w-2 rounded-full mr-3 bg-red-500" aria-hidden="true"></div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate dark:text-neutral-200">{person.name}</p>
                            </div>
                        </div>
                  </div>
                            ))
                ) : (
                            <div className="text-center py-2 text-muted-foreground dark:text-neutral-400 col-span-2">
                              No pending PPE checks found
                  </div>
                          )
                )}
                      </div>
                    </div>
            )}
                </div>
              </CardContent>
          </Card>
          </div>

          {/* Recent Activity */}
          <Card className="border-gray-200 dark:border-neutral-700 dark:bg-neutral-800">
            <CardHeader className="flex flex-row items-center justify-between px-4 py-2.5 sm:px-6 sm:py-4 border-b border-gray-100 dark:border-neutral-700">
              <div className="flex items-center">
                <CardTitle className="text-base font-semibold dark:text-neutral-100">Recent Activity</CardTitle>
              </div>
              <div className="flex items-center space-x-1 sm:space-x-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3 dark:text-neutral-100 dark:border-neutral-700 dark:bg-neutral-700 dark:hover:bg-neutral-600"
                  onClick={() => setIsViewAllActivity(!isViewAllActivity)}
                >
                  {isViewAllActivity ? "Show Less" : "View All"}
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 w-6 p-0 rounded-full ml-1 sm:ml-2 dark:text-neutral-300 dark:hover:bg-neutral-700"
                  onClick={() => setIsRecentActivityExpanded(!isRecentActivityExpanded)}
                  aria-label={isRecentActivityExpanded ? "Minimize" : "Expand"}
                >
                  {isRecentActivityExpanded ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-minus">
                      <path d="M5 12h14"/>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-plus">
                      <path d="M5 12h14"/>
                      <path d="M12 5v14"/>
                    </svg>
                  )}
                </Button>
              </div>
            </CardHeader>
            {isRecentActivityExpanded && (
              <CardContent className="px-4 py-3 sm:px-6 sm:pb-6">
                <div className="space-y-3 sm:space-y-4">
                  {recentActivities.length > 0 ? (
                    recentActivities
                      .slice(0, isViewAllActivity ? undefined : 5)
                      .map((activity, index) => (
                        <ActivityItem
                          key={index}
                          title={activity.title}
                          timestamp={activity.timestamp}
                          type={activity.type}
                          status={activity.status}
                        />
                      ))
                  ) : (
                    <div className="text-center py-4 sm:py-6 text-muted-foreground dark:text-neutral-400">
                      No recent activity found
                    </div>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      </main>
    </div>
  )
}

// Update MetricCard component with progress bar
const MetricCard = ({ title, value, change, progress, variant = 'default' }: MetricCardProps) => {
  if (!title || !value || !change) return null;
  
  return (
    <Card className="border-gray-200 dark:border-neutral-700 dark:bg-neutral-800">
      <CardContent className="p-3 sm:p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-300" role="heading" aria-level={3}>
            {title}
          </p>
          <span 
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              variant === 'attention' 
                ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" 
                : "bg-neutral-100 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-300"
            )}
            role="status"
            aria-label={`Status: ${change}`}
          >
            {change}
          </span>
        </div>
        <div className="mt-1 sm:mt-2">
          <p className="text-xl sm:text-2xl font-medium text-neutral-900 dark:text-neutral-100" role="status" aria-label={`Value: ${value}`}>
            {value}
          </p>
          {progress !== undefined && (
            <div className="mt-1.5 sm:mt-2 h-1.5 w-full rounded-full bg-neutral-100 dark:bg-neutral-700 overflow-hidden">
              <div 
                className="h-full rounded-full bg-green-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface ProgressSectionProps {
  title: string;
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  sectionKey?: 'armoury' | 'vehicleFPT' | 'bwc';
  isSelected?: boolean;
  customDescription?: string;
  onSectionClick?: (section: 'armoury' | 'vehicleFPT' | 'bwc') => void;
}

const ProgressSection = ({ 
  title, 
  total, 
  completed, 
  inProgress, 
  pending, 
  sectionKey,
  isSelected,
  customDescription,
  onSectionClick 
}: ProgressSectionProps) => {
  const completedPercent = (completed / total) * 100;
  // We're not using inProgressPercent anymore
  const pendingPercent = (pending / total) * 100;

  return (
    <div 
      className={`space-y-1 sm:space-y-2 ${sectionKey ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-800 p-2 rounded-md -mx-2 transition-colors relative group' : ''}`}
      onClick={() => sectionKey && onSectionClick && onSectionClick(sectionKey)}
    >
      {sectionKey && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {isSelected ? 
            <Minimize2 className="h-4 w-4 text-neutral-500" /> : 
            <Maximize2 className="h-4 w-4 text-neutral-500" />
          }
        </div>
      )}
      <div className="flex justify-between text-sm dark:text-neutral-300">
        <div className="flex items-center">
          <span>{title}</span>
          {sectionKey && (
            <ChevronDown className={`h-4 w-4 ml-1 text-neutral-400 transition-transform ${isSelected ? 'rotate-180' : ''}`} />
          )}
        </div>
        <span className="font-medium">{completed}/{total} completed</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 dark:bg-neutral-700 overflow-hidden flex">
        <div 
          className="h-full bg-green-500"
          style={{ width: `${completedPercent}%` }}
        />
        <div 
          className="h-full bg-red-500"
          style={{ width: `${pendingPercent}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground dark:text-neutral-400">
        <span>{completed} completed</span>
        <span>{pending} pending</span>
      </div>
      {customDescription && (
        <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{customDescription}</div>
      )}
    </div>
  )
}

// Update ActivityItem component with proper timestamp handling and status indicators
const ActivityItem = ({ title, timestamp, type = 'equipment', status = 'updated' }: ActivityItemProps) => {
  if (!title || !timestamp) return null;

  const getISOString = (timeString: string) => {
    if (!timeString) return new Date().toISOString();
    
    if (timeString.includes('ago')) {
      return new Date().toISOString();
    }
    
    try {
      return new Date(timeString).toISOString();
    } catch (e) {
      return new Date().toISOString();
    }
  };

  // Get appropriate status color
  const getStatusColor = () => {
    if (status === 'completed') return 'bg-green-500';
    if (status === 'assigned') return 'bg-blue-500';
    if (status === 'submitted') return 'bg-green-500';
    return 'bg-neutral-200 dark:bg-neutral-600';
  };

  return (
    <div className="flex items-start sm:items-center gap-3 sm:gap-4" role="listitem">
      <div className={`h-2 w-2 rounded-full mt-1.5 sm:mt-0 ${getStatusColor()}`} aria-hidden="true"></div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-neutral-900 dark:text-neutral-200 break-words">{title}</p>
        <time 
          className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400" 
          dateTime={getISOString(timestamp)}
        >
          {timestamp}
        </time>
      </div>
    </div>
  )
}

// New component for pending items
const PendingItem = ({ name, section, type }: PendingItemProps) => {
  return (
    <div className="flex items-center py-2 px-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
      <div className={`h-2 w-2 rounded-full mr-3 ${type === 'equipment' ? 'bg-amber-500' : 'bg-blue-500'}`} aria-hidden="true"></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium truncate dark:text-gray-200">{name}</p>
          {section && (
            <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 px-2 py-0.5 rounded-full ml-2 flex-shrink-0">
              {section}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground dark:text-gray-400 mt-0.5">
          {type === 'ppe' ? 'PPE Check Pending' : 'Equipment Check Pending'}
        </p>
      </div>
    </div>
  );
};

