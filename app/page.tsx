'use client'

import { Bell, Settings, Search, Plus } from 'lucide-react';
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useEffect, useState } from 'react'
import { cn } from "@/lib/utils"
import { createClient } from '@supabase/supabase-js';

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
}

interface PendingItemProps {
  name: string;
  section?: string;
  type: 'ppe' | 'equipment';
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

export default function Dashboard() {
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
    vehicleLPT: {
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

        // Get unique personnel names (to avoid counting duplicates in the view)
        const uniquePersonnel = new Set();
        personnelData?.forEach(person => {
          if (person.personnel_name) {
            uniquePersonnel.add(person.personnel_name);
          }
        });
        const total = uniquePersonnel.size;

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

        // 3. Calculate progress metrics
        // Create a map of personnel to their most recent submission
        const submissionMap = new Map();
        responseData?.forEach(response => {
          if (!submissionMap.has(response.personnel_name)) {
            submissionMap.set(response.personnel_name, {
              submitted_at: response.submitted_at,
              response_id: response.response_id
            });
          }
        });
        
        // Count only unique personnel who have submitted
        const completed = submissionMap.size;
        const inProgress = 0; // We don't track in-progress for form submissions
        const pending = total - completed;

        console.log(`PPE Progress: ${completed}/${total} completed, ${pending} pending`);
        setPpeProgress({ total, completed, inProgress, pending });

        // Track pending personnel for PPE checks
        const pendingPersonnel: PendingItemProps[] = [];
        uniquePersonnel.forEach(name => {
          if (!submissionMap.has(name)) {
            pendingPersonnel.push({
              name: name as string,
              type: 'ppe'
            });
          }
        });

        // Update pending items state with PPE pending personnel
        setPendingItems(prevItems => {
          // Filter out any previous PPE items
          const equipmentItems = prevItems.filter(item => item.type === 'equipment');
          return [...equipmentItems, ...pendingPersonnel];
        });

        // 4. Update recent activities
        if (responseData && responseData.length > 0) {
          // Group by personnel_name and take only the most recent submission for each person
          const uniqueSubmissions = Array.from(submissionMap.entries()).map(([name, data]) => ({
            personnel_name: name,
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
              status: 'submitted'
            };
          });
          
          setRecentActivities(prevActivities => {
            // Combine with any equipment check activities
            const combinedActivities = [...recentSubmissions, ...prevActivities.filter(a => a.type === 'equipment')];
            
            // Sort by timestamp (most recent first)
            combinedActivities.sort((a, b) => {
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

        // Group items by section
        const sections = {
          armoury: checklistData?.filter(item => item.section.toUpperCase() === 'ARMOURY') || [],
          vehicleFPT: checklistData?.filter(item => item.section.toUpperCase() === 'VEHICLE FPT') || [],
          vehicleLPT: checklistData?.filter(item => item.section.toUpperCase() === 'VEHICLE LPT') || [],
          bwc: checklistData?.filter(item => item.section.toUpperCase() === 'BWC') || []
        };

        // Calculate progress for each section
        const progress = {
          armoury: calculateSectionProgress(sections.armoury),
          vehicleFPT: calculateSectionProgress(sections.vehicleFPT),
          vehicleLPT: calculateSectionProgress(sections.vehicleLPT),
          // Special handling for BWC - track all 9 but only expect 5 to be checked
          bwc: calculateBwcProgress(sections.bwc)
        };

        setEquipmentProgress(progress);
        console.log('Equipment progress updated:', progress);

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
          
        // Add pending vehicle LPT items
        sections.vehicleLPT
          .filter(item => !item.checked)
          .forEach(item => {
            pendingEquipment.push({
              name: item.name,
              section: 'Vehicle LPT',
              type: 'equipment'
            });
          });
          
        // Add pending BWC items (only if we have fewer than 5 checked)
        if (sections.bwc.filter(item => item.checked).length < 5) {
          sections.bwc
            .filter(item => !item.checked)
            .slice(0, 5 - sections.bwc.filter(item => item.checked).length)
            .forEach(item => {
              pendingEquipment.push({
                name: item.name,
                section: 'BWC',
                type: 'equipment'
              });
            });
        }

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
              status: item.checked ? 'completed' : (item.assigned_to ? 'assigned' : 'updated')
            };
          }) || [];

        setRecentActivities(prevActivities => {
          // Combine with any PPE check activities
          const combinedActivities = [...recentUpdates, ...prevActivities.filter(a => a.type === 'ppe')];
          
          // Sort by timestamp (most recent first)
          combinedActivities.sort((a, b) => {
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
    const calculateBwcProgress = (items: any[]) => {
      const totalItems = items.length; // This will be 9
      const targetChecks = 5; // We only expect 5 checks
      
      const completed = items.filter(item => item.checked).length;
      // We're removing in-progress tracking as requested
      
      // For BWC, we consider it fully complete if at least 5 items are checked
      const effectiveCompleted = Math.min(completed, targetChecks);
      const effectivePending = targetChecks - effectiveCompleted;
      
      console.log(`BWC Progress: ${completed}/${totalItems} items checked, ${effectiveCompleted}/${targetChecks} effective completion`);
      
      return { 
        total: targetChecks, // We report 5 as the total expected
        completed: effectiveCompleted,
        inProgress: 0, // Set to 0 as we're not tracking in-progress
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
                equipmentProgress.vehicleLPT.completed + 
                equipmentProgress.bwc.completed
              }/${
                equipmentProgress.armoury.total + 
                equipmentProgress.vehicleFPT.total + 
                equipmentProgress.vehicleLPT.total + 
                equipmentProgress.bwc.total
              }`}
              change={`${calculateProgress(
                equipmentProgress.armoury.completed + 
                equipmentProgress.vehicleFPT.completed + 
                equipmentProgress.vehicleLPT.completed + 
                equipmentProgress.bwc.completed,
                equipmentProgress.armoury.total + 
                equipmentProgress.vehicleFPT.total + 
                equipmentProgress.vehicleLPT.total + 
                equipmentProgress.bwc.total
              )}% complete`}
              progress={calculateProgress(
                equipmentProgress.armoury.completed + 
                equipmentProgress.vehicleFPT.completed + 
                equipmentProgress.vehicleLPT.completed + 
                equipmentProgress.bwc.completed,
                equipmentProgress.armoury.total + 
                equipmentProgress.vehicleFPT.total + 
                equipmentProgress.vehicleLPT.total + 
                equipmentProgress.bwc.total
              )}
            />
            <MetricCard
              title="Total Tasks Pending"
              value={`${
                ppeProgress.pending + 
                equipmentProgress.armoury.pending + 
                equipmentProgress.vehicleFPT.pending + 
                equipmentProgress.vehicleLPT.pending + 
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
                <CardTitle className="text-base font-semibold dark:text-neutral-100">Equipment Check Status</CardTitle>
              </CardHeader>
              <CardContent className="px-4 py-3 sm:px-6 sm:py-6">
                <div className="space-y-3 sm:space-y-6">
                  <ProgressSection
                    title="Armoury"
                    total={equipmentProgress.armoury.total}
                    completed={equipmentProgress.armoury.completed}
                    inProgress={0}
                    pending={equipmentProgress.armoury.pending}
                  />
                  <ProgressSection
                    title="Vehicle FPT"
                    total={equipmentProgress.vehicleFPT.total}
                    completed={equipmentProgress.vehicleFPT.completed}
                    inProgress={0}
                    pending={equipmentProgress.vehicleFPT.pending}
                  />
                  <ProgressSection
                    title="Vehicle LPT"
                    total={equipmentProgress.vehicleLPT.total}
                    completed={equipmentProgress.vehicleLPT.completed}
                    inProgress={0}
                    pending={equipmentProgress.vehicleLPT.pending}
                  />
                  <ProgressSection
                    title="BWC"
                    total={equipmentProgress.bwc.total}
                    completed={equipmentProgress.bwc.completed}
                    inProgress={0}
                    pending={equipmentProgress.bwc.pending}
                  />
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
                    <div className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-card dark:bg-neutral-700 p-2 sm:p-3">
                      <div className="text-2xl sm:text-3xl font-bold text-green-500 dark:text-green-400">{ppeProgress.completed}</div>
                      <div className="text-xs text-muted-foreground dark:text-neutral-400">Completed</div>
                    </div>
                    <div className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-card dark:bg-neutral-700 p-2 sm:p-3">
                      <div className="text-2xl sm:text-3xl font-bold text-red-500 dark:text-red-400">{ppeProgress.pending}</div>
                      <div className="text-xs text-muted-foreground dark:text-neutral-400">Pending</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Pending Items Detail */}
          <Card className="border-gray-200 dark:border-neutral-700 dark:bg-neutral-800">
            <CardHeader className="flex flex-row items-center justify-between px-4 py-2.5 sm:px-6 sm:py-4 border-b border-gray-100 dark:border-neutral-700">
              <div className="flex items-center">
                <CardTitle className="text-base font-semibold dark:text-neutral-100">Pending Items Detail</CardTitle>
              </div>
              <div className="flex items-center">
                <div className="flex bg-gray-100 dark:bg-neutral-900 rounded-md p-0.5">
                  <Button 
                    variant={pendingItemsFilter === 'all' ? 'default' : 'ghost'} 
                    size="sm" 
                    className={`h-7 text-xs px-2 rounded-sm ${
                      pendingItemsFilter === 'all' 
                        ? 'bg-black text-white dark:bg-black dark:text-white' 
                        : 'text-gray-700 hover:text-gray-900 dark:text-neutral-300 dark:hover:text-neutral-100'
                    }`}
                    onClick={() => setPendingItemsFilter('all')}
                  >
                    All
                  </Button>
                  <Button 
                    variant={pendingItemsFilter === 'equipment' ? 'default' : 'ghost'} 
                    size="sm" 
                    className={`h-7 text-xs px-2 rounded-sm ${
                      pendingItemsFilter === 'equipment' 
                        ? 'bg-black text-white dark:bg-black dark:text-white' 
                        : 'text-gray-700 hover:text-gray-900 dark:text-neutral-300 dark:hover:text-neutral-100'
                    }`}
                    onClick={() => setPendingItemsFilter('equipment')}
                  >
                    Equipment
                  </Button>
                  <Button 
                    variant={pendingItemsFilter === 'ppe' ? 'default' : 'ghost'} 
                    size="sm" 
                    className={`h-7 text-xs px-2 rounded-sm ${
                      pendingItemsFilter === 'ppe' 
                        ? 'bg-black text-white dark:bg-black dark:text-white' 
                        : 'text-gray-700 hover:text-gray-900 dark:text-neutral-300 dark:hover:text-neutral-100'
                    }`}
                    onClick={() => setPendingItemsFilter('ppe')}
                  >
                    PPE
                  </Button>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 w-6 p-0 rounded-full ml-1 sm:ml-2 dark:text-neutral-300 dark:hover:bg-neutral-700"
                  onClick={() => setIsPendingItemsExpanded(!isPendingItemsExpanded)}
                  aria-label={isPendingItemsExpanded ? "Minimize" : "Expand"}
                >
                  {isPendingItemsExpanded ? (
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
            {isPendingItemsExpanded && (
              <CardContent className="px-4 py-3 sm:px-6 sm:pb-6">
                {pendingItems.length > 0 ? (
                  <div>
                    {/* Group items by section */}
                    {(() => {
                      // Create a map of sections to items
                      const sectionMap = new Map<string, PendingItemProps[]>();
                      
                      // Filter items based on the selected filter
                      const filteredItems = pendingItems.filter(item => {
                        if (pendingItemsFilter === 'all') return true;
                        return item.type === pendingItemsFilter;
                      });
                      
                      // Group equipment items by section
                      filteredItems
                        .filter(item => item.type === 'equipment')
                        .forEach(item => {
                          const section = item.section || 'Other';
                          // Skip BWC items
                          if (section === 'BWC') return;
                          if (!sectionMap.has(section)) {
                            sectionMap.set(section, []);
                          }
                          sectionMap.get(section)!.push(item);
                        });
                      
                      // Add PPE items as their own section
                      const ppeItems = filteredItems.filter(item => item.type === 'ppe');
                      if (ppeItems.length > 0) {
                        sectionMap.set('PPE Checks', ppeItems);
                      }
                      
                      // Sort sections: Equipment sections first, then PPE
                      const sortedSections = Array.from(sectionMap.keys()).sort((a, b) => {
                        if (a === 'PPE Checks') return 1;
                        if (b === 'PPE Checks') return -1;
                        return a.localeCompare(b);
                      });
                      
                      // If no items match the filter, show a message
                      if (sortedSections.length === 0) {
                        return (
                          <div className="text-center py-4 sm:py-6 text-muted-foreground dark:text-neutral-400">
                            No {pendingItemsFilter === 'all' ? '' : pendingItemsFilter} pending items found
                          </div>
                        );
                      }
                      
                      return (
                        <div className="space-y-3 sm:space-y-4">
                          {sortedSections.map(section => (
                            <div key={section} className="space-y-1">
                              <h3 className="text-sm font-medium text-gray-700 dark:text-neutral-300 mb-2 border-b border-gray-200 dark:border-neutral-700 pb-1">
                                {section} ({sectionMap.get(section)!.length})
                              </h3>
                              <div className="grid gap-1 grid-cols-1 sm:grid-cols-2">
                                {sectionMap.get(section)!.map((item, index) => (
                                  <div key={`${section}-${index}`} className="border border-gray-200 dark:border-neutral-700 rounded-md dark:bg-neutral-700">
                                    <div className="flex items-center p-2">
                                      <div className={`h-2 w-2 rounded-full mr-3 ${item.type === 'equipment' ? 'bg-amber-500' : 'bg-blue-500'}`} aria-hidden="true"></div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate dark:text-neutral-200">{item.name}</p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="text-center py-4 sm:py-6 text-muted-foreground dark:text-neutral-400">
                    No pending items found
                  </div>
                )}
              </CardContent>
            )}
          </Card>

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
}

const ProgressSection = ({ title, total, completed, inProgress, pending }: ProgressSectionProps) => {
  const completedPercent = (completed / total) * 100;
  // We're not using inProgressPercent anymore
  const pendingPercent = (pending / total) * 100;

  return (
    <div className="space-y-1 sm:space-y-2">
      <div className="flex justify-between text-sm dark:text-neutral-300">
        <span>{title}</span>
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

