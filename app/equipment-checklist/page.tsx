'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import Link from 'next/link'
import { ArrowLeft, X, Trash2, RefreshCw, Pencil, ExternalLink } from 'lucide-react'
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import React from 'react'
import { createBrowserClient } from '@supabase/ssr'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { SwipeableRow } from "@/components/SwipeableRow"

interface ChecklistItem {
  id: number;
  name: string;
  checked: boolean;
  assignedTo?: string;
  status?: string;
  identifier?: string;
  required?: boolean;
}

interface ChecklistSection {
  title: string;
  items: ChecklistItem[];
}

export default function EquipmentChecklistPage() {
  const { toast } = useToast();
  // Initialize Supabase client
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // State for personnel data
  const [personnelData, setPersonnelData] = useState<{[key: string]: string[]}>({
    "REGULARS": [],
    "NS SECTION COMMANDER": [],
    "NS MARINE FIREFIGHTER": [],
    "ORNS/VES": []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState<{sectionIndex: number, itemIndex: number} | null>(null);
  const [localIdentifiers, setLocalIdentifiers] = useState<{[key: string]: string}>({});
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [highlightedCheckbox, setHighlightedCheckbox] = useState<{sectionIndex: number, itemIndex: number} | null>(null);
  const [pendingSaves, setPendingSaves] = useState<{[key: string]: NodeJS.Timeout}>({});
  // Add a state to track which fields are currently being edited by the user
  const [activeEditingFields, setActiveEditingFields] = useState<Set<string>>(new Set());

  // Add a ref map to store references to input fields
  const inputRefs = useRef<{[key: string]: HTMLInputElement | null}>({});

  // Add a state to track which input fields should show the focus animation
  const [animateInputs, setAnimateInputs] = useState<{[key: string]: boolean}>({});

  // Add a state for reset dialog
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  // Add state for edit vehicle dialog
  const [isEditVehicleDialogOpen, setIsEditVehicleDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<{
    sectionIndex: number;
    itemIndex: number;
    name: string;
    plateNumber?: string;
  } | null>(null);

  // Add a ref to track the last processed update
  const lastProcessedUpdates = useRef<Record<string, string>>({});

  // Add a ref to track the last saved values
  const lastSavedValues = useRef<Record<string, any>>({});

  // Add a ref to track pending save timeouts
  const saveDebouncers = useRef<Record<string, NodeJS.Timeout>>({});

  // Add the missing state variables
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Add a ref to track the last state updates
  const lastStateUpdates = useRef<Record<string, string>>({});

  // Add a state for reset vehicles dialog
  const [isResetVehiclesDialogOpen, setIsResetVehiclesDialogOpen] = useState(false);

  // Add at the beginning of the component, after useState declarations
  const [lastTapped, setLastTapped] = useState<{sectionIndex: number, itemIndex: number} | null>(null);

  // Fetch personnel data from Supabase
  useEffect(() => {
    async function fetchPersonnel() {
      try {
        console.log('Fetching personnel data...');
        
        // Fetch personnel data efficiently by selecting only needed fields
        const { data, error } = await supabase
          .from('personnel')
          .select('id, name, rank, grouping')
          .order('name');
        
        if (error) {
          console.error('Error fetching personnel:', error);
          return;
        }

        if (!data?.length) {
          console.warn('No personnel data found');
          return;
        }

        // Only log in development
        if (process.env.NODE_ENV === 'development') {
          console.log('Raw personnel data:', data);
        }

        // Map groupings to our standard categories
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
          
          // For ORNS/VES - exclude Watchroom Operator
          if (grouping === 'Reservist / VES') {
            return 'ORNS/VES';
          }
          
          // Exclude Watchroom Operator by returning empty string
          if (grouping === 'Watchroom Operator') {
            return '';
          }
          
          return 'ORNS/VES'; // Default category for other groupings
        };

        // Group personnel by category
        const grouped: { [key: string]: string[] } = {
          "REGULARS": [],
          "NS SECTION COMMANDER": [],
          "NS MARINE FIREFIGHTER": [],
          "ORNS/VES": []
        };

        data.forEach(person => {
          const category = getCategory(person.grouping);
          let displayName = person.name;
          
          // If the person has a rank field and it's not already in the name
          if (person.rank && !person.name.includes(person.rank)) {
            displayName = `${person.rank} ${person.name}`;
          }
          
          // Only add to a valid category
          if (category && grouped[category]) {
            grouped[category].push(displayName);
          }
        });

        // Add "Others" to ORNS/VES
        if (!grouped["ORNS/VES"].includes("Others")) {
          grouped["ORNS/VES"].push("Others");
        }

        // Sort each group by rank
        const getRankOrder = (name: string) => {
          const rank = name.split(' ')[0].toUpperCase();
          const rankOrder: { [key: string]: number } = {
            // Regulars
            'LTA': 1,
            'WO2': 2,
            'WO1': 3,
            'SGT3': 4,
            // Firefighters
            'SGT1': 1,
            'CPL': 2,
            'LCP': 3
          };
          return rankOrder[rank] || 999; // Default high number for unknown ranks
        };

        // Sort each group
        Object.keys(grouped).forEach(category => {
          grouped[category].sort((a, b) => {
            return getRankOrder(a) - getRankOrder(b);
          });
        });

        // Only log in development
        if (process.env.NODE_ENV === 'development') {
          console.log('Processed personnel data:', grouped);
        }
        
        // Compare current data with new data using JSON stringify for deep comparison
        const currentDataString = JSON.stringify(personnelData);
        const newDataString = JSON.stringify(grouped);
        
        if (currentDataString !== newDataString) {
          console.log('Personnel data changed, updating state');
          setPersonnelData(grouped);
        } else {
          console.log('No changes in personnel data, skipping update');
        }
      } catch (error) {
        console.error('Error processing personnel data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchPersonnel();
  }, [supabase]); // Remove personnelData dependency to prevent unnecessary re-fetches

  // Use memoized personnelGroups to prevent unnecessary renders
  const personnelGroups = useMemo(() => {
    return isLoading || Object.values(personnelData).every(group => group.length === 0) 
      ? {
          "REGULARS": [
            "LTA Matin",
            "LTA Eddie Ho",
            "WO2 Zahrim",
            "WO1 Taufiq",
            "WO1 Sofyean",
            "WO1 Ardy",
            "SGT3 Ahmad Mustaqim",
            "SGT3 Kamaruzaman",
            "SGT3 Hafidz",
            "SGT3 Chia Kah Fai",
          ],
          "NS SECTION COMMANDER": [
            "SGT1 Naufal",
            "SGT1 Abdullah",
            "SGT1 Danial",
            "SGT1 David",
            "SGT1 Haroon",
            "SGT1 Shao Zhe",
          ],
          "NS MARINE FIREFIGHTER": [
            "CPL Iman",
            "CPL Naqiudin",
            "CPL Mukesh",
            "CPL Mikhail",
            "LCP Effee",
            "LCP Jake"
          ],
          "ORNS/VES": [
            "Others"
          ]
        }
      : personnelData;
  }, [personnelData, isLoading]);

  // Debug log for personnelGroups - only in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Personnel groups for dropdown:', personnelGroups);
    }
  }, [personnelGroups]);

  // List of checkers
  const checkers = [
    "SGT1 Naufal",
    "SGT1 Abdullah",
    "SGT1 Danial",
    "SGT1 David",
    "SGT1 Haroon",
    "SGT1 Shao Zhe",
    "CPL Iman",
    "CPL Naqiudin",
    "CPL Mukesh",
    "CPL Mikhail",
    "LCP Effee",
    "LCP Jake"
  ];

  // List of vehicle checkers
  const vehicleCheckers = [
    "LTA Matin",
    "LTA Eddie Ho",
    "WO2 Zahrim",
    "WO1 Taufiq",
    "WO1 Sofyean",
    "WO1 Ardy",
    "SGT3 Ahmad Mustaqim",
    "SGT3 Kamaruzaman",
    "SGT3 Hafidz",
    "SGT3 Chia Kah Fai",
    "Others"
  ];

  // List of BWC holders (same as vehicle checkers)
  const bwcHolders = [
    "LTA Matin",
    "LTA Eddie Ho",
    "WO2 Zahrim",
    "WO1 Taufiq",
    "WO1 Sofyean",
    "WO1 Ardy",
    "SGT3 Ahmad Mustaqim",
    "SGT3 Kamaruzaman",
    "SGT3 Hafidz",
    "SGT3 Kah Fai",
    "SGT1 Naufal",
    "SGT1 Abdullah",
    "SGT1 Danial",
    "SGT1 David",
    "Others"
  ];

  // Fuel levels
  const fuelLevels = [
    "Full",
    "Above 3/4",
    "Exactly 3/4",
    "Above 1/2",
    "Exactly 1/2",
    "Below 1/2",
    "Pending"
  ];

  // Create a combined list for BWC section
  const allCheckers = bwcHolders;

  const [sections, setSections] = useState<ChecklistSection[]>([
    {
      title: "ARMOURY",
      items: [
        { id: 1, name: "LF811", checked: false },
        { id: 2, name: "LF812", checked: false },
        { id: 3, name: "RFV811", checked: false },
        { id: 4, name: "MRV811", checked: false },
        { id: 5, name: "MRV EMT Bag 1", checked: false },
        { id: 6, name: "MRV EMT Bag 2", checked: false },
      ]
    },
    {
      title: "VEHICLE FPT",
      items: [
        { id: 1, name: "CFS FRC (QX1859E)", checked: false },
        { id: 2, name: "Class 4 Truck (YN4304C)", checked: false },
        { id: 3, name: "LF811 (GDB7755P)", checked: false },
        { id: 4, name: "LF812 (GBD6351C)", checked: false },
        { id: 5, name: "Admin FRC (QX1034T)", checked: false },
        { id: 6, name: "Spare LF (GBF8661J)", checked: false },
      ]
    },
    {
      title: "VEHICLE LPT",
      items: [
        { id: 1, name: "CFS FRC (QX1859E)", checked: false },
        { id: 2, name: "Class 4 Truck (YN4304C)", checked: false },
        { id: 3, name: "LF811 (GBF8661J)", checked: false },
        { id: 4, name: "LF812 (GBD6351C)", checked: false },
        { id: 5, name: "Admin FRC (QX1034T)", checked: false },
        { id: 6, name: "Spare LF (GBD7755P)", checked: false },
      ]
    },
    {
      title: "BWC",
      items: [
        { id: 1, name: "G0247 8417", checked: false },
        { id: 2, name: "G0247 8421", checked: false },
        { id: 3, name: "G0247 8448", checked: false },
        { id: 4, name: "G0247 8450", checked: false },
        { id: 5, name: "G0247 8454", checked: false },
        { id: 6, name: "G0453 8776", checked: false },
        { id: 7, name: "F9144 1494", checked: false },
        { id: 8, name: "F9144 1507", checked: false },
        { id: 9, name: "F9251 5515", checked: false },
      ]
    }
  ]);

  // Add the initializeEquipmentChecklist function
  const initializeEquipmentChecklist = useCallback(async () => {
    try {
      console.log('Initializing equipment checklist with default data...');
      
      // Default sections data
      const defaultSections = {
        "ARMOURY": [
          { id: 1, name: "LF811", checked: false },
          { id: 2, name: "LF812", checked: false },
          { id: 3, name: "RFV811", checked: false },
          { id: 4, name: "MRV811", checked: false },
          { id: 5, name: "MRV EMT Bag 1", checked: false },
          { id: 6, name: "MRV EMT Bag 2", checked: false },
        ],
        "VEHICLE FPT": [
          { id: 1, name: "CFS FRC (QX1859E)", checked: false },
          { id: 2, name: "Class 4 Truck (YN4304C)", checked: false },
          { id: 3, name: "LF811 (GDB7755P)", checked: false },
          { id: 4, name: "LF812 (GBD6351C)", checked: false },
          { id: 5, name: "Admin FRC (QX1034T)", checked: false },
          { id: 6, name: "Spare LF (GBF8661J)", checked: false },
        ],
        "VEHICLE LPT": [
          { id: 1, name: "CFS FRC (QX1859E)", checked: false },
          { id: 2, name: "Class 4 Truck (YN4304C)", checked: false },
          { id: 3, name: "LF811 (GBF8661J)", checked: false },
          { id: 4, name: "LF812 (GBD6351C)", checked: false },
          { id: 5, name: "Admin FRC (QX1034T)", checked: false },
          { id: 6, name: "Spare LF (GBD7755P)", checked: false },
        ],
        "BWC": [
          { id: 1, name: "G0247 8417", checked: false },
          { id: 2, name: "G0247 8421", checked: false },
          { id: 3, name: "G0247 8448", checked: false },
          { id: 4, name: "G0247 8450", checked: false },
          { id: 5, name: "G0247 8454", checked: false },
          { id: 6, name: "G0453 8776", checked: false },
          { id: 7, name: "F9144 1494", checked: false },
          { id: 8, name: "F9144 1507", checked: false },
          { id: 9, name: "F9251 5515", checked: false },
        ]
      };
      
      // Save default items to database
      const itemsToSave = Object.entries(defaultSections).flatMap(([section, items]) =>
        items.map(item => ({
          section,
          item_id: item.id,
          name: item.name,
          checked: false,
          assigned_to: null,
          status: null,
          identifier: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }))
      );
      
      const { error: saveError } = await supabase
        .from('equipment_checklist')
        .insert(itemsToSave);
      
      if (saveError) {
        console.error('Error saving default items:', saveError);
        setFetchError(`Failed to initialize equipment checklist: ${saveError.message}`);
        return;
      }
      
      // Instead of calling fetchEquipmentData, create sections directly
      const newSections = Object.keys(defaultSections).map(title => ({
        title,
        items: defaultSections[title as keyof typeof defaultSections]
      }));
      
      // Sort sections in the desired order
      newSections.sort((a, b) => {
        const order = ['ARMOURY', 'VEHICLE FPT', 'VEHICLE LPT', 'BWC'];
        return order.indexOf(a.title) - order.indexOf(b.title);
      });
      
      console.log('Setting new sections from initialization:', newSections);
      setSections(newSections);
      
    } catch (error) {
      console.error('Error in initializeEquipmentChecklist:', error);
      setFetchError('An unexpected error occurred while initializing data');
    }
  }, [supabase]);

  // Optimize the saveItemToDatabase function to better track what's already saved
  const saveItemToDatabase = async (sectionTitle: string, item: ChecklistItem) => {
    try {
      // Create a unique key for tracking this item
      const itemKey = `${sectionTitle}-${item.id}`;
      
      // Only log in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`Saving item to database: ${itemKey}`);
      }
      
      // Prepare the data, explicitly setting null values for cleared fields
      // Use snake_case field names to match database schema
      const data = {
        section: sectionTitle,
        item_id: item.id,
        name: item.name,
        checked: item.checked,
        assigned_to: item.assignedTo || null,
        status: item.status || null,
        identifier: item.identifier || null,
      };
      
      // Generate a hash of current values to compare against last saved
      const dataHash = JSON.stringify(data);
      
      // Skip save if this exact data was already saved (prevents duplicate saves)
      if (lastSavedValues.current[itemKey] === dataHash) {
        console.log(`No changes for ${itemKey}, skipping save`);
        return;
      }
      
      setIsSaving(true);
      setSaveError(null);
      
      // Update item in database with debounce
      if (saveDebouncers.current[itemKey]) {
        clearTimeout(saveDebouncers.current[itemKey]);
      }
      
      saveDebouncers.current[itemKey] = setTimeout(async () => {
        try {
          // Track the last processed realtime update to avoid echo effects
          lastProcessedUpdates.current[itemKey] = dataHash;
          
          const { error } = await supabase
            .from('equipment_checklist')
            .upsert([data], {
              onConflict: 'section,item_id',
              ignoreDuplicates: false,
            });
          
          if (error) {
            throw error;
          }
          
          // Save the hash for future comparison
          lastSavedValues.current[itemKey] = dataHash;
          
          if (process.env.NODE_ENV === 'development') {
            console.log(`Item saved successfully: ${itemKey}`);
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`Error saving item ${itemKey}:`, error);
          setSaveError(`Failed to save: ${errorMessage}`);
        } finally {
          setIsSaving(false);
        }
      }, 300); // 300ms debounce
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error in saveItemToDatabase:', error);
      setIsSaving(false);
      setSaveError(`Unexpected error: ${errorMessage}`);
    }
  };

  // Optimize the fetchEquipmentData function
  const fetchEquipmentData = async () => {
    try {
      setFetchError(null);
      console.log('Fetching equipment checklist data...');
      
      // Use a single query to get all the data at once with specific filters
      // Fix column names to use snake_case instead of camelCase
      const { data, error } = await supabase
        .from('equipment_checklist')
        .select('section, item_id, name, checked, assigned_to, status, identifier')
        .order('item_id');
        
      if (error) {
        console.error('Error fetching equipment checklist data:', error);
        setFetchError('Failed to load checklist data.');
        return;
      }
      
      // If no data is found, don't update state
      if (!data || data.length === 0) {
        console.warn('No equipment checklist data found');
        return;
      }
      
      // Organize data into sections
      const groupedBySection: Record<string, ChecklistItem[]> = {};
      
      data.forEach(item => {
        if (!groupedBySection[item.section]) {
          groupedBySection[item.section] = [];
        }
        
        // Map snake_case field names to camelCase for the component
        groupedBySection[item.section].push({
          id: item.item_id,
          name: item.name,
          checked: item.checked,
          assignedTo: item.assigned_to,
          status: item.status,
          identifier: item.identifier,
          required: false // Default value for required
        });
      });
      
      // Create sections array in the preferred order
      const sectionOrder = ["ARMOURY", "VEHICLE FPT", "VEHICLE LPT", "BWC"];
      const newSections: ChecklistSection[] = sectionOrder.map(title => ({
        title,
        items: groupedBySection[title] || []
      }));
      
      // Generate a hash of the current sections for comparison
      const currentSectionsJSON = JSON.stringify(sections);
      const newSectionsJSON = JSON.stringify(newSections);
      
      // Only update state if there are actual changes
      if (currentSectionsJSON !== newSectionsJSON) {
        console.log('Sections have changed, updating state');
        setSections(newSections);
      } else {
        console.log('No changes in sections data, skipping update');
      }
      
      // For debugging - only in development
      if (process.env.NODE_ENV === 'development') {
        console.log('Sections state updated: ', newSections);
        console.log('Vehicle FPT items: ', newSections.find(s => s.title === "VEHICLE FPT")?.items);
        console.log('Vehicle LPT items: ', newSections.find(s => s.title === "VEHICLE LPT")?.items);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error in fetchEquipmentData:', error);
      setFetchError(`Unexpected error loading checklist data: ${errorMessage}`);
    }
  };

  // Optimize the subscription handling to avoid redundant data fetches
  const setupRealtimeSubscription = useCallback(() => {
    console.log('Creating new channel:', `equipment_checklist_${Date.now()}`);
    
    // Create a new channel with a unique name to avoid conflicts
    const channel = supabase.channel(`equipment_checklist_${Date.now()}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'equipment_checklist' 
      }, (payload: any) => {
        const { eventType, new: newRecord, old: oldRecord } = payload;
        
        // Skip if we just saved this item (prevent echo effect)
        const itemKey = `${newRecord?.section || oldRecord?.section}-${newRecord?.item_id || oldRecord?.item_id}`;
        const payloadHash = JSON.stringify(newRecord);
        
        // Skip if this is an echo of our own update
        if (lastProcessedUpdates.current[itemKey] === payloadHash) {
          console.log(`Skipping event for ${itemKey} - matches our last update`);
          return;
        }
        
        // Track events by type to avoid duplicates
        const lastProcessedEvents: Record<string, Record<string, string>> = {
          INSERT: {},
          UPDATE: {},
          DELETE: {}
        };
        
        // Skip duplicate events (can happen with multiple clients)
        if (lastProcessedEvents[eventType]?.[itemKey] === payloadHash) {
          console.log(`Skipping duplicate ${eventType} event for ${itemKey}`);
          return;
        }
        
        // Update tracking
        if (!lastProcessedEvents[eventType]) {
          lastProcessedEvents[eventType] = {};
        }
        lastProcessedEvents[eventType][itemKey] = payloadHash;
        
        console.log(`Real-time update received (${eventType}):`, payload);
        
        // For small changes, consider updating state directly instead of refetching
        if (eventType === 'UPDATE' && newRecord) {
          // Update the state directly for the specific item
          setSections(prevSections => {
            // Find the section and item
            const sectionIndex = prevSections.findIndex(s => s.title === newRecord.section);
            if (sectionIndex === -1) return prevSections;
            
            const itemIndex = prevSections[sectionIndex].items.findIndex(i => i.id === newRecord.item_id);
            if (itemIndex === -1) return prevSections;
            
            // Only update if the data is actually different
            const currentItem = prevSections[sectionIndex].items[itemIndex];
            
            // Map snake_case database fields to camelCase component fields
            const updatedItem = {
              ...currentItem,
              name: newRecord.name || currentItem.name,
              checked: newRecord.checked ?? currentItem.checked,
              assignedTo: newRecord.assigned_to,
              status: newRecord.status,
              identifier: newRecord.identifier
            };
            
            // Check if anything actually changed
            if (JSON.stringify(currentItem) === JSON.stringify(updatedItem)) {
              console.log('No changes detected in item, skipping state update');
              return prevSections;
            }
            
            // Create a new array with the updated item
            const updatedSections = [...prevSections];
            const updatedItems = [...updatedSections[sectionIndex].items];
            updatedItems[itemIndex] = updatedItem;
            updatedSections[sectionIndex] = {
              ...updatedSections[sectionIndex],
              items: updatedItems
            };
            
            console.log('Directly updating state for item:', itemKey);
            return updatedSections;
          });
        } else {
          // For insertions, deletions, or complex changes, refetch
          fetchEquipmentData();
        }
      })
      .subscribe((status: string) => {
        console.log('Subscription status:', status || '<empty string>');
        
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to equipment checklist changes');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Channel error, will attempt to reconnect');
        } else if (status === 'TIMED_OUT') {
          console.error('Subscription timed out, will attempt to reconnect');
        } else if (status === 'CLOSED') {
          console.log('Channel closed, no retry needed as this is expected');
        }
      });
    
    console.log('Channel setup completed:', channel);
    return channel;
  }, [supabase, fetchEquipmentData]);

  // Set up real-time subscription for equipment_checklist with improved initialization
  useEffect(() => {
    let channelInstance: any = null;
    let isComponentMounted = true;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let initTimer: NodeJS.Timeout | null = null;

    async function initSubscription() {
      try {
        // Fetch data first to ensure we have the latest state before setting up real-time
        if (isComponentMounted) {
          console.log('Pre-fetching equipment data before setting up real-time...');
          await fetchEquipmentData();
        }
        
        if (!isComponentMounted) return;
        
        console.log('Initializing real-time subscription...');
        
        // Clean up any existing channel before creating a new one
        if (channelInstance) {
          console.log('Removing existing channel before creating a new one');
          await supabase.removeChannel(channelInstance).catch(err => {
            console.error('Error removing existing channel:', err);
          });
          channelInstance = null;
        }
        
        // Only create a new channel if the component is still mounted
        if (isComponentMounted) {
          // Create a new channel
          channelInstance = setupRealtimeSubscription();
          console.log('New channel created:', channelInstance ? 'success' : 'failed');
          
          // If channel creation failed, try again after a delay
          if (!channelInstance && isComponentMounted) {
            console.log('Channel creation failed, will retry in 3 seconds');
            reconnectTimer = setTimeout(() => {
              if (isComponentMounted) {
                initSubscription();
              }
            }, 3000);
          }
        }
      } catch (error: any) {
        console.error('Error initializing subscription:', error);
        
        // Try to reconnect after a delay
        if (isComponentMounted) {
          console.log('Error in subscription, will retry in 3 seconds');
          reconnectTimer = setTimeout(() => {
            if (isComponentMounted) {
              initSubscription();
            }
          }, 3000);
        }
      }
    }

    // Initial setup with a small delay to ensure all state is initialized
    initTimer = setTimeout(() => {
      initSubscription();
    }, 1000); // Increased delay to ensure all state is properly initialized

    // Cleanup
    return () => {
      isComponentMounted = false;
      
      if (initTimer) {
        clearTimeout(initTimer);
      }
      
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      
      if (channelInstance) {
        console.log('Cleaning up subscription on component unmount...');
        // Use a try-catch to prevent errors during cleanup
        try {
          // We need to use a synchronous approach here to ensure cleanup happens
          // before the component is fully unmounted
          supabase.removeChannel(channelInstance).catch((err: any) => {
            console.error('Error removing channel during cleanup:', err);
          });
        } catch (error) {
          console.error('Error in cleanup function:', error);
        }
      }
    };
  }, [supabase, fetchEquipmentData, setupRealtimeSubscription]);

  // Call fetchEquipmentData when the component mounts
  useEffect(() => {
    fetchEquipmentData();
  }, [fetchEquipmentData]);

  const handleCheckboxChange = (sectionIndex: number, itemIndex: number, checked: boolean) => {
    const currentItem = sections[sectionIndex].items[itemIndex];
    
    // Create a new item with updated checked status
    const updatedItem = {
      ...currentItem,
      checked
    };
    
    // Use a more targeted state update approach
    setSections(prevSections => {
      const updatedSections = [...prevSections];
      // Create a new items array for just the affected section
      const updatedItems = [...updatedSections[sectionIndex].items];
      // Update only the specific item
      updatedItems[itemIndex] = updatedItem;
      // Update the section with the new items array
      updatedSections[sectionIndex] = {
        ...updatedSections[sectionIndex],
        items: updatedItems
      };
      return updatedSections;
    });
    
    // Save to database
    saveItemToDatabase(
      sections[sectionIndex].title,
      updatedItem
    );
  };

  const handleCheckerChange = (sectionIndex: number, itemIndex: number, checker: string) => {
    const key = `${sectionIndex}-${itemIndex}`;
    const currentItem = sections[sectionIndex].items[itemIndex];
    
    // Create a new item with updated values
    const updatedItem = {
      ...currentItem,
      assignedTo: checker,
      // Automatically set checked to true when a checker is assigned
      checked: checker ? true : currentItem.checked
    };
    
    // For vehicle sections, also set a default fuel level if not already set
    if (checker && isVehicleSection(sections[sectionIndex].title)) {
      // Set default fuel level to "Pending" if not already set
      if (!updatedItem.status) {
        updatedItem.status = "Pending";
      }
      
      // Highlight the identifier field to indicate it needs to be filled
      if (!updatedItem.identifier) {
        // Set typing indicator for the identifier field
        setIsTyping({ sectionIndex, itemIndex });
        
        // Clear typing indicator after 3 seconds
        setTimeout(() => {
          // Only clear if it's still the same item being highlighted
          if (isTyping && 
              isTyping.sectionIndex === sectionIndex && 
              isTyping.itemIndex === itemIndex) {
            setIsTyping(null);
          }
        }, 3000);
        
        // Set animation state for this input
        setAnimateInputs(prev => ({
          ...prev,
          [key]: true
        }));
        
        // Focus the response ID input field after a short delay
        setTimeout(() => {
          const inputRef = inputRefs.current[key];
          if (inputRef) {
            inputRef.focus();
          }
        }, 100);
        
        // Clear animation after a delay
        setTimeout(() => {
          setAnimateInputs(prev => ({
            ...prev,
            [key]: false
          }));
        }, 2000);
      }
    }
    
    // Highlight the checkbox briefly
    if (checker) {
      setHighlightedCheckbox({ sectionIndex, itemIndex });
      setTimeout(() => {
        setHighlightedCheckbox(null);
      }, 1500); // Remove highlight after 1.5 seconds
    }
    
    // Use a more targeted state update approach
    setSections(prevSections => {
      const updatedSections = [...prevSections];
      // Create a new items array for just the affected section
      const updatedItems = [...updatedSections[sectionIndex].items];
      // Update only the specific item
      updatedItems[itemIndex] = updatedItem;
      // Update the section with the new items array
      updatedSections[sectionIndex] = {
        ...updatedSections[sectionIndex],
        items: updatedItems
      };
      return updatedSections;
    });
    
    // Save to database
    saveItemToDatabase(
      sections[sectionIndex].title,
      updatedItem
    );
  };

  const handleIdentifierChange = useCallback((sectionIndex: number, itemIndex: number, identifier: string) => {
    const key = `${sectionIndex}-${itemIndex}`;
    
    // Mark this field as being actively edited
    if (!activeEditingFields.has(key)) {
      setActiveEditingFields(prev => {
        const newSet = new Set(prev);
        newSet.add(key);
        return newSet;
      });
    }
    
    // Update only the local state for immediate UI feedback
    setLocalIdentifiers(prev => ({
      ...prev,
      [key]: identifier
    }));
    
    // Clear any existing timer for this specific item
    if (pendingSaves[key]) {
      clearTimeout(pendingSaves[key]);
    }
    
    // Use a longer debounce for updating main state and saving to database
    const timeoutId = setTimeout(() => {
      const currentItem = sections[sectionIndex].items[itemIndex];
      
      // Create a new item with updated identifier
      const updatedItem = {
        ...currentItem,
        identifier
      };
      
      // Use a more targeted state update approach
      setSections(prevSections => {
        const updatedSections = [...prevSections];
        // Create a new items array for just the affected section
        const updatedItems = [...updatedSections[sectionIndex].items];
        // Update only the specific item
        updatedItems[itemIndex] = updatedItem;
        // Update the section with the new items array
        updatedSections[sectionIndex] = {
          ...updatedSections[sectionIndex],
          items: updatedItems
        };
        return updatedSections;
      });
      
      // Save to database
      saveItemToDatabase(
        sections[sectionIndex].title,
        updatedItem
      );
      
      // Remove from pending saves
      setPendingSaves(prev => {
        const newPendingSaves = { ...prev };
        delete newPendingSaves[key];
        return newPendingSaves;
      });
      
      // Mark this field as no longer being edited
      setActiveEditingFields(prev => {
        const newSet = new Set(prev);
        newSet.delete(key);
        return newSet;
      });
    }, 300); // Reduced debounce to 300ms for smoother typing experience
    
    // Add to pending saves
    setPendingSaves(prev => ({
      ...prev,
      [key]: timeoutId
    }));
  }, [sections, activeEditingFields, pendingSaves]);

  // Add a function to handle input blur events
  const handleInputBlur = (sectionIndex: number, itemIndex: number) => {
    const key = `${sectionIndex}-${itemIndex}`;
    const identifier = localIdentifiers[key];
    
    // If there's a pending save, clear it and update immediately
    if (pendingSaves[key]) {
      clearTimeout(pendingSaves[key]);
      
      // Remove from pending saves
      setPendingSaves(prev => {
        const newState = { ...prev };
        delete newState[key];
        return newState;
      });
      
      // If there's a value in local state, update the main state
      if (identifier !== undefined) {
        const currentItem = sections[sectionIndex].items[itemIndex];
        
        // Create a new item with updated identifier
        const updatedItem = {
          ...currentItem,
          identifier
        };
        
        // Use a more targeted state update approach
        setSections(prevSections => {
          const updatedSections = [...prevSections];
          // Create a new items array for just the affected section
          const updatedItems = [...updatedSections[sectionIndex].items];
          // Update only the specific item
          updatedItems[itemIndex] = updatedItem;
          // Update the section with the new items array
          updatedSections[sectionIndex] = {
            ...updatedSections[sectionIndex],
            items: updatedItems
          };
          return updatedSections;
        });
        
        // Save to database
        saveItemToDatabase(
          sections[sectionIndex].title,
          updatedItem
        );
      }
    }
    
    // Mark this field as no longer being edited
    setActiveEditingFields(prev => {
      const newSet = new Set(prev);
      newSet.delete(key);
      return newSet;
    });
  };

  // Add CSS transition to input field
  const inputStyle = "transition: border-color 0.2s ease-in-out;";

  // Clean up all pending save timers on unmount
  useEffect(() => {
    return () => {
      // Clear debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      
      // Clear all pending save timers
      Object.values(pendingSaves).forEach(timeoutId => {
        clearTimeout(timeoutId);
      });
    };
  }, [pendingSaves]);

  const handleClearItem = (sectionIndex: number, itemIndex: number) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`Clearing item: section ${sectionIndex}, item ${itemIndex}`);
    }
    
    const currentItem = sections[sectionIndex].items[itemIndex];
    const key = `${sectionIndex}-${itemIndex}`;
    
    // Skip if item is already cleared
    if (!currentItem.checked && !currentItem.assignedTo && !currentItem.status && !currentItem.identifier) {
      console.log(`Item already cleared: section ${sectionIndex}, item ${itemIndex}`);
      return;
    }
    
    // Create a new cleared item with default values
    const clearedItem = {
      ...currentItem,
      checked: false,
      assignedTo: undefined,
      status: undefined,
      identifier: undefined
    };
    
    // Use a more targeted state update approach
    setSections(prevSections => {
      const updatedSections = [...prevSections];
      // Create a new items array for just the affected section
      const updatedItems = [...updatedSections[sectionIndex].items];
      // Update only the specific item
      updatedItems[itemIndex] = clearedItem;
      // Update the section with the new items array
      updatedSections[sectionIndex] = {
        ...updatedSections[sectionIndex],
        items: updatedItems
      };
      return updatedSections;
    });
    
    // Clear local identifier state
    setLocalIdentifiers(prev => {
      const newState = { ...prev };
      delete newState[key];
      return newState;
    });
    
    // Clear any pending saves
    if (pendingSaves[key]) {
      clearTimeout(pendingSaves[key]);
      setPendingSaves(prev => {
        const newState = { ...prev };
        delete newState[key];
        return newState;
      });
    }
    
    // Remove from active editing fields
    setActiveEditingFields(prev => {
      const newSet = new Set(prev);
      newSet.delete(key);
      return newSet;
    });
    
    // Clear typing indicator if it was showing for this item
    if (isTyping && 
        isTyping.sectionIndex === sectionIndex && 
        isTyping.itemIndex === itemIndex) {
      setIsTyping(null);
    }
    
    // Save to database with explicit null values - use a unique key to prevent echo effects
    const itemKey = `${sections[sectionIndex].title}-${currentItem.id}`;
    lastProcessedUpdates.current[itemKey] = JSON.stringify({
      section: sections[sectionIndex].title,
      item_id: currentItem.id,
      name: currentItem.name,
      checked: false,
      assigned_to: null,
      status: null,
      identifier: null
    });
    
    // Save to database
    saveItemToDatabase(
      sections[sectionIndex].title,
      clearedItem
    );
  };

  const isVehicleSection = (title: string) => {
    return title === "VEHICLE FPT" || title === "VEHICLE LPT";
  };

  // Add a handler for the refresh button
  const handleRefresh = async () => {
    try {
      console.log('Manually refreshing equipment checklist data...');
      await fetchEquipmentData();
    } catch (error) {
      console.error('Error refreshing equipment checklist:', error);
      setSaveError('An unexpected error occurred while refreshing');
    }
  };

  // Add a function to reset vehicle entries to default values
  const handleResetVehicles = async () => {
    try {
      setIsSaving(true);
      setSaveError(null);
      setIsResetVehiclesDialogOpen(false);

      // Default vehicle data for FPT section
      const defaultVehiclesFPT = [
        { id: 1, name: "CFS FRC (QX1859E)" },
        { id: 2, name: "Class 4 Truck (YN4304C)" },
        { id: 3, name: "LF811 (GDB7755P)" },
        { id: 4, name: "LF812 (GBD6351C)" },
        { id: 5, name: "Admin FRC (QX1034T)" },
        { id: 6, name: "Spare LF (GBF8661J)" }
      ];

      // Default vehicle data for LPT section
      const defaultVehiclesLPT = [
        { id: 1, name: "CFS FRC (QX1859E)" },
        { id: 2, name: "Class 4 Truck (YN4304C)" },
        { id: 3, name: "LF811 (GBF8661J)" },
        { id: 4, name: "LF812 (GBD6351C)" },
        { id: 5, name: "Admin FRC (QX1034T)" },
        { id: 6, name: "Spare LF (GBD7755P)" }
      ];

      // Fetch current data to preserve other fields
      const { data: currentData, error: fetchError } = await supabase
        .from('equipment_checklist')
        .select('*')
        .or('section.eq.VEHICLE FPT,section.eq.VEHICLE LPT');

      if (fetchError) {
        throw fetchError;
      }

      // Update FPT vehicles
      for (const vehicle of defaultVehiclesFPT) {
        // Find current item data to preserve other fields
        const currentItem = currentData?.find(
          item => item.section === 'VEHICLE FPT' && item.item_id === vehicle.id
        );

        // Only update the name field, keep all other fields intact
        if (currentItem) {
          await supabase
            .from('equipment_checklist')
            .update({ 
              name: vehicle.name,
              // Explicitly set the updated_at field
              updated_at: new Date().toISOString()
            })
            .eq('section', 'VEHICLE FPT')
            .eq('item_id', vehicle.id);
        }
      }

      // Update LPT vehicles
      for (const vehicle of defaultVehiclesLPT) {
        // Find current item data to preserve other fields
        const currentItem = currentData?.find(
          item => item.section === 'VEHICLE LPT' && item.item_id === vehicle.id
        );

        // Only update the name field, keep all other fields intact
        if (currentItem) {
          await supabase
            .from('equipment_checklist')
            .update({ 
              name: vehicle.name,
              // Explicitly set the updated_at field
              updated_at: new Date().toISOString()
            })
            .eq('section', 'VEHICLE LPT')
            .eq('item_id', vehicle.id);
        }
      }

      // Refresh data
      await fetchEquipmentData();

      toast({
        title: "Success",
        description: "Vehicle entries have been reset to their default values. Existing assignments and status information has been preserved.",
      });
    } catch (error) {
      console.error('Error resetting vehicle entries:', error);
      setSaveError('An unexpected error occurred while resetting vehicles');
      
      toast({
        title: "Error",
        description: "Failed to reset vehicle entries. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      setIsSaving(true);
      setSaveError(null);
      setIsResetDialogOpen(false);

      // Reset all sections to their default state
      const resetSections = sections.map(section => ({
        ...section,
        items: section.items.map(item => ({
          ...item,
          checked: false,
          assignedTo: undefined,
          status: undefined,
          identifier: undefined
        }))
      }));

      // Update local state
      setSections(resetSections);
      setLocalIdentifiers({});
      setPendingSaves({});
      setActiveEditingFields(new Set());
      setIsTyping(null);
      setHighlightedCheckbox(null);

      // Save all reset items to database
      for (const section of resetSections) {
        for (const item of section.items) {
          await saveItemToDatabase(section.title, item);
        }
      }
    } catch (error) {
      console.error('Error resetting equipment checklist:', error);
      setSaveError('An unexpected error occurred while resetting');
    } finally {
      setIsSaving(false);
    }
  };

  // Add debug logging with useEffect
  useEffect(() => {
    console.log('Sections state updated:', sections);
    console.log('Vehicle FPT items:', sections.find(s => s.title === "VEHICLE FPT")?.items);
    console.log('Vehicle LPT items:', sections.find(s => s.title === "VEHICLE LPT")?.items);
  }, [sections]);

  // Add function to handle vehicle name editing
  const handleEditVehicle = (sectionIndex: number, itemIndex: number) => {
    const item = sections[sectionIndex].items[itemIndex];
    const [name, plateNumber] = item.name.split(' (');
    setEditingVehicle({
      sectionIndex,
      itemIndex,
      name,
      plateNumber: plateNumber.replace(')', '')
    });
    setIsEditVehicleDialogOpen(true);
  };

  // Add function to save vehicle name changes
  const handleSaveVehicle = async () => {
    if (!editingVehicle) return;

    const { sectionIndex, itemIndex, name, plateNumber } = editingVehicle;
    const section = sections[sectionIndex];
    const item = section.items[itemIndex];
    const isVehicleSection = section.title === "VEHICLE FPT" || section.title === "VEHICLE LPT";
    const newName = isVehicleSection ? `${name} (${plateNumber})` : name;

    try {
      setIsSaving(true);
      
      // For vehicle sections, update both FPT and LPT
      if (isVehicleSection) {
        interface VehicleUpdate {
          section: string;
          item_id: number;
          name: string;
        }
        
        const updates: VehicleUpdate[] = [];
        
        // Get the current item's ID
        const currentItemId = item.id;
        
        // Find ONLY the corresponding entry in the other section with the same item_id
        const otherSectionTitle = section.title === "VEHICLE FPT" ? "VEHICLE LPT" : "VEHICLE FPT";
        const otherSection = sections.find(s => s.title === otherSectionTitle);
        
        // Add the current item to updates
        updates.push({
          section: section.title,
          item_id: currentItemId,
          name: newName
        });
        
        // If we found a corresponding entry in the other section with the same item_id, add it too
        if (otherSection) {
          const correspondingItem = otherSection.items.find(i => i.id === currentItemId);
          if (correspondingItem) {
            updates.push({
              section: otherSectionTitle,
              item_id: currentItemId,
              name: newName
            });
          }
        }

        // Update all matching entries
        for (const update of updates) {
          const { error } = await supabase
            .from('equipment_checklist')
            .update({
              name: update.name,
              updated_at: new Date().toISOString()
            })
            .eq('section', update.section)
            .eq('item_id', update.item_id);

          if (error) throw error;
        }

        // Update local state
        const newSections = [...sections];
        updates.forEach(update => {
          const sectionIndex = newSections.findIndex(s => s.title === update.section);
          if (sectionIndex !== -1) {
            const itemIndex = newSections[sectionIndex].items.findIndex(i => i.id === update.item_id);
            if (itemIndex !== -1) {
              newSections[sectionIndex].items[itemIndex].name = update.name;
            }
          }
        });
        setSections(newSections);

        toast({
          title: "Success",
          description: `Vehicle updated successfully in ${updates.length} section${updates.length > 1 ? 's' : ''}`,
        });
      } else {
        // For non-vehicle sections (Armoury and BWC), just update the single item
        const { error } = await supabase
          .from('equipment_checklist')
          .update({
            name: newName,
            updated_at: new Date().toISOString()
          })
          .eq('section', section.title)
          .eq('item_id', item.id);

        if (error) throw error;

        // Update local state
        const newSections = [...sections];
        newSections[sectionIndex].items[itemIndex].name = newName;
        setSections(newSections);

        toast({
          title: "Success",
          description: `${section.title === "ARMOURY" ? "Armoury item" : "BWC serial number"} updated successfully`,
        });
      }

      setIsEditVehicleDialogOpen(false);
      setEditingVehicle(null);
    } catch (error) {
      console.error('Error updating item:', error);
      toast({
        title: "Error",
        description: "Failed to update item. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Add function to handle editing any item
  const handleEditItem = (sectionIndex: number, itemIndex: number) => {
    const item = sections[sectionIndex].items[itemIndex];
    const isVehicleSection = sections[sectionIndex].title === "VEHICLE FPT" || sections[sectionIndex].title === "VEHICLE LPT";
    
    if (isVehicleSection) {
      const [name, plateNumber] = item.name.split(' (');
      setEditingVehicle({
        sectionIndex,
        itemIndex,
        name,
        plateNumber: plateNumber.replace(')', '')
      });
    } else {
      setEditingVehicle({
        sectionIndex,
        itemIndex,
        name: item.name
      });
    }
    setIsEditVehicleDialogOpen(true);
  };

  // Restore the handleStatusChange function
  const handleStatusChange = (sectionIndex: number, itemIndex: number, status: string) => {
    const currentItem = sections[sectionIndex].items[itemIndex];
    
    // Create a new item with updated status
    const updatedItem = {
      ...currentItem,
      status
    };
    
    // Use a more targeted state update approach
    setSections(prevSections => {
      const updatedSections = [...prevSections];
      // Create a new items array for just the affected section
      const updatedItems = [...updatedSections[sectionIndex].items];
      // Update only the specific item
      updatedItems[itemIndex] = updatedItem;
      // Update the section with the new items array
      updatedSections[sectionIndex] = {
        ...updatedSections[sectionIndex],
        items: updatedItems
      };
      return updatedSections;
    });
    
    // Save to database
    saveItemToDatabase(
      sections[sectionIndex].title,
      updatedItem
    );
  };

  return (
    <div className="container mx-auto py-3 sm:py-6 px-3 sm:px-6">
      {/* Remove inline debug logging */}
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col space-y-4 sm:space-y-6 relative">
          <header className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Link href="/" className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 sm:h-10 px-2 sm:px-4 py-0">
                <ArrowLeft className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Back to Dashboard</span>
              </Link>
              <h1 className="text-lg sm:text-xl font-semibold">Equipment Checklist</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="h-8 sm:h-10 px-2 sm:px-4 flex items-center gap-1 active-feedback"
                disabled={isSaving || isLoading}
                aria-label="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>
          </header>
          
          {/* Status indicator */}
          <div className="flex items-center gap-2">
            {isLoading && (
              <div className="text-xs sm:text-sm text-muted-foreground flex items-center">
                <span className="inline-block h-2 w-2 rounded-full bg-blue-500 mr-2 animate-pulse"></span>
                Loading...
              </div>
            )}
            {isSaving && (
              <div className="text-xs sm:text-sm text-muted-foreground flex items-center">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500 mr-2 animate-pulse"></span>
                Saving...
              </div>
            )}
            {saveError && (
              <div className="text-xs sm:text-sm text-red-500 flex items-center">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500 mr-2"></span>
                {saveError}
              </div>
            )}
            {!isLoading && !isSaving && !saveError && (
              <div className="text-xs sm:text-sm text-green-500 flex items-center">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500 mr-2"></span>
                All changes saved
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {sections.map((section, sectionIndex) => (
            <Card key={section.title} className="overflow-hidden">
              <CardHeader className="px-4 md:px-6 py-2.5 md:py-4 border-b border-gray-200 dark:border-gray-800">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-base sm:text-lg">{section.title}</CardTitle>
                  {section.title === "ARMOURY" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3 flex items-center gap-1 sm:gap-2 border-amber-500 text-amber-600 hover:bg-amber-50 dark:border-amber-400 dark:text-amber-400 dark:hover:bg-amber-900/20"
                      asChild
                    >
                      <Link href="https://armoury.gov.sg/sign-in?inviteCode=team-clomngf8o29tj305957m6wyyj" target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        <span className="hidden sm:inline">Open Armoury Portal</span>
                        <span className="sm:hidden">Portal</span>
                      </Link>
                    </Button>
                  )}
                  {(section.title === "VEHICLE FPT" || section.title === "VEHICLE LPT") && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3 flex items-center gap-1 sm:gap-2 border-blue-500 text-blue-600 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-900/20"
                      asChild
                    >
                      <Link href="https://form.gov.sg/63c8b31edd51570011467ead" target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        <span className="hidden sm:inline">Open Vehicle Form</span>
                        <span className="sm:hidden">Form</span>
                      </Link>
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {/* Desktop View */}
                <div className="hidden md:block">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="w-[200px] px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            {section.title === "ARMOURY" ? "Appliance" : 
                             isVehicleSection(section.title) ? "Vehicle" : 
                             section.title === "BWC" ? "Serial Number" : "Item"}
                          </th>
                          <th className="w-[100px] px-4 py-3 text-center text-sm font-medium text-muted-foreground">Status</th>
                          {section.title === "ARMOURY" ? (
                            <>
                              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                                <span className="pl-3">Checker</span>
                              </th>
                              <th className="w-[100px] px-4 py-3 text-center text-sm font-medium text-muted-foreground">Clear</th>
                            </>
                          ) : isVehicleSection(section.title) ? (
                            <>
                              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                                <span className="pl-3">Checker</span>
                              </th>
                              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                                <span className="pl-3">Fuel Level</span>
                              </th>
                              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                                <span className="pl-3">Response ID</span>
                              </th>
                              <th className="w-[100px] px-4 py-3 text-center text-sm font-medium text-muted-foreground">Clear</th>
                            </>
                          ) : (
                            <>
                              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                                <span className="pl-3">Assigned To</span>
                              </th>
                              <th className="w-[100px] px-4 py-3 text-center text-sm font-medium text-muted-foreground">Clear</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {section.items.map((item, itemIndex) => (
                          <tr 
                            key={item.id} 
                            className={cn(
                              "border-b border-muted/30 last:border-0",
                              item.checked ? "bg-muted/40 dark:bg-muted/30 transition-colors duration-150" : ""
                            )}
                          >
                            <td className="px-4 py-3 text-sm font-medium text-neutral-700 dark:text-neutral-300 group">
                              <div className="flex items-center justify-between">
                                <span>{item.name}</span>
                                {(section.title === "ARMOURY" || section.title === "BWC" || isVehicleSection(section.title)) && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEditItem(sectionIndex, itemIndex)}
                                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                                    aria-label={`Edit ${item.name}`}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-center items-center">
                                <div className="relative flex items-center justify-center">
                                  <Checkbox 
                                    id={`${section.title}-${item.id}-desktop`}
                                    checked={item.checked}
                                    onCheckedChange={(checked) => {
                                      setLastTapped({sectionIndex, itemIndex});
                                      setTimeout(() => setLastTapped(null), 50);
                                      handleCheckboxChange(sectionIndex, itemIndex, checked as boolean);
                                    }}
                                    className={cn(
                                      "h-6 w-6 cursor-pointer data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground transition-colors duration-50",
                                      highlightedCheckbox && 
                                      highlightedCheckbox.sectionIndex === sectionIndex && 
                                      highlightedCheckbox.itemIndex === itemIndex ? 
                                      "ring-2 ring-primary ring-offset-2 transition-all duration-50" : ""
                                    )}
                                    aria-label={`Mark ${item.name} as ${item.checked ? 'unchecked' : 'checked'}`}
                                  />
                                  {item.required && !item.checked && (
                                    <span className="ml-1 text-red-500 animate-pulse-medium">*</span>
                                  )}
                                </div>
                              </div>
                            </td>
                            {section.title === "ARMOURY" ? (
                              <>
                                <td className="px-4 py-3">
                                  <Select
                                    value={item.assignedTo || ""}
                                    onValueChange={(value) => handleCheckerChange(sectionIndex, itemIndex, value)}
                                  >
                                    <SelectTrigger className="w-full">
                                      <SelectValue placeholder="Select checker" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(personnelGroups)
                                        .filter(([group]) => {
                                          // For MRV EMT Bag items, only show REGULARS
                                          if (item.name.includes("MRV EMT Bag")) {
                                            return group === "REGULARS";
                                          }
                                          // For other Armoury items, exclude REGULARS
                                          return group !== "REGULARS";
                                        })
                                        .map(([group, members]) => (
                                        <React.Fragment key={group}>
                                          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{group}</div>
                                          {members && members.length > 0 ? members.map((checker) => (
                                            <SelectItem key={checker} value={checker} className="text-xs py-1">
                                              {checker}
                                            </SelectItem>
                                          )) : (
                                            <div className="px-2 py-1.5 text-xs text-muted-foreground/70">No personnel available</div>
                                          )}
                                          {group !== "ORNS/VES" && <div className="h-px my-1 bg-muted/50" />}
                                        </React.Fragment>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleClearItem(sectionIndex, itemIndex)}
                                    className="h-6 w-6 p-0 transition-colors duration-150"
                                    aria-label={`Clear ${item.name}`}
                                  >
                                    <X className="h-3.5 w-3.5 text-red-500" />
                                  </Button>
                                </td>
                              </>
                            ) : isVehicleSection(section.title) ? (
                              <>
                                <td className="px-4 py-3">
                                  <Select
                                    key={`checker-${section.title}-${item.id}`}
                                    value={item.assignedTo || ""}
                                    onValueChange={(value) => handleCheckerChange(sectionIndex, itemIndex, value)}
                                  >
                                    <SelectTrigger 
                                      className="w-full h-9 text-xs min-h-0 py-0 px-2 transition-all duration-100 active-feedback" 
                                      aria-label={`Select checker for ${item.name}`}
                                    >
                                      <SelectValue placeholder="Select checker" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(personnelGroups)
                                        .filter(([group]) => group === "REGULARS")
                                        .map(([group, members]) => (
                                        <React.Fragment key={group}>
                                          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{group}</div>
                                          {members && members.length > 0 ? members.map((checker) => (
                                            <SelectItem key={checker} value={checker} className="text-xs py-1">
                                              {checker}
                                            </SelectItem>
                                          )) : (
                                            <div className="px-2 py-1.5 text-xs text-muted-foreground/70">No personnel available</div>
                                          )}
                                        </React.Fragment>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-between mb-1">
                                  <Select
                                    key={`fuel-${section.title}-${item.id}`}
                                    value={item.status || ""}
                                    onValueChange={(value) => handleStatusChange(sectionIndex, itemIndex, value)}
                                  >
                                    <SelectTrigger 
                                      className={cn(
                                        "w-full transition-all duration-150 border active-feedback",
                                        "focus:border-amber-300 focus:ring-amber-500",
                                        item.assignedTo && (item.status === "Pending" || !item.status)
                                          ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20 animate-pulse-medium" 
                                          : ""
                                      )}
                                      aria-label={`Select fuel level for ${item.name}`}
                                    >
                                      <SelectValue placeholder="Select fuel level" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {fuelLevels.map((level) => (
                                        <SelectItem key={level} value={level} className="text-xs py-1">
                                          {level}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                    {item.required && !item.checked && (
                                      <span className="ml-1 text-red-500 animate-pulse-medium">*</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-between mb-1">
                                    <Input
                                      ref={(el) => {
                                        inputRefs.current[`${sectionIndex}-${itemIndex}`] = el;
                                      }}
                                      value={localIdentifiers[`${sectionIndex}-${itemIndex}`] !== undefined 
                                        ? localIdentifiers[`${sectionIndex}-${itemIndex}`] 
                                        : item.identifier || ""}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        handleIdentifierChange(sectionIndex, itemIndex, value);
                                      }}
                                      onBlur={() => handleInputBlur(sectionIndex, itemIndex)}
                                      placeholder="Response ID"
                                      className={cn(
                                        "w-full transition-all duration-150 border text-xs h-10 px-3",
                                        "focus:border-amber-300 focus:ring-amber-500",
                                        item.assignedTo && !item.identifier && !localIdentifiers[`${sectionIndex}-${itemIndex}`]
                                          ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20 animate-pulse-medium" 
                                          : "",
                                        animateInputs[`${sectionIndex}-${itemIndex}`] 
                                          ? "shadow-md scale-[1.02] border-amber-400" 
                                          : ""
                                      )}
                                      aria-label="Response ID input"
                                      tabIndex={0}
                                    />
                                    {item.required && !item.identifier && !localIdentifiers[`${sectionIndex}-${itemIndex}`] ? (
                                      <span className="ml-1 text-red-500 animate-pulse-medium">*</span>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleClearItem(sectionIndex, itemIndex)}
                                    className="h-6 w-6 p-0 transition-colors duration-150"
                                    aria-label={`Clear ${item.name}`}
                                  >
                                    <X className="h-3.5 w-3.5 text-red-500" />
                                  </Button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-4 py-3">
                                  <Select
                                    value={item.assignedTo || ""}
                                    onValueChange={(value) => handleCheckerChange(sectionIndex, itemIndex, value)}
                                  >
                                    <SelectTrigger className="w-full">
                                      <SelectValue placeholder="Select personnel" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(personnelGroups)
                                        .filter(([group]) => group !== "NS MARINE FIREFIGHTER")
                                        .map(([group, members]) => (
                                        <React.Fragment key={group}>
                                          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{group}</div>
                                          {members && members.length > 0 ? members.map((checker) => (
                                            <SelectItem key={checker} value={checker} className="text-xs py-1">
                                              {checker}
                                            </SelectItem>
                                          )) : (
                                            <div className="px-2 py-1.5 text-xs text-muted-foreground/70">No personnel available</div>
                                          )}
                                          {group !== "ORNS/VES" && <div className="h-px my-1 bg-muted/50" />}
                                        </React.Fragment>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleClearItem(sectionIndex, itemIndex)}
                                    className="h-6 w-6 p-0 transition-colors duration-150"
                                    aria-label={`Clear ${item.name}`}
                                  >
                                    <X className="h-3.5 w-3.5 text-red-500" />
                                  </Button>
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mobile View */}
                <div className="md:hidden">
                  {section.title === "ARMOURY" && (
                    <div className="border-t border-gray-200 dark:border-gray-800">
                      <div className="grid grid-cols-12 px-3 py-1.5 bg-gray-50 dark:bg-neutral-800/50 text-[10px] font-medium text-muted-foreground">
                        <div className="col-span-4 truncate pr-1">Appliance</div>
                        <div className="col-span-6 truncate pr-1">
                          <span className="pl-3">Checker</span>
                        </div>
                        <div className="col-span-2 text-center truncate">Status</div>
                      </div>
                      {section.items.map((item, itemIndex) => (
                        <SwipeableRow
                          key={item.id}
                          onEdit={() => handleEditItem(sectionIndex, itemIndex)}
                          onClear={() => handleClearItem(sectionIndex, itemIndex)}
                          isChecked={item.checked}
                        >
                          <div 
                            className={cn(
                              "border-t border-gray-100 dark:border-gray-800 first:border-t-0",
                              item.checked ? "bg-muted/40 dark:bg-muted/30" : "",
                              lastTapped && lastTapped.sectionIndex === sectionIndex && lastTapped.itemIndex === itemIndex 
                                ? "bg-muted/60 dark:bg-muted/50" : ""
                            )}
                            style={{ WebkitTapHighlightColor: 'transparent' }}
                          >
                            <div className="px-3 py-2">
                              <div className="grid grid-cols-12 items-center gap-2">
                                <div className="col-span-4 text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate">
                                  {item.name}
                                </div>
                                <div className="col-span-6">
                                  <Select
                                    value={item.assignedTo || ""}
                                    onValueChange={(value) => handleCheckerChange(sectionIndex, itemIndex, value)}
                                  >
                                    <SelectTrigger 
                                      className="w-full h-9 text-xs min-h-0 py-0 px-2 transition-all duration-100" 
                                      aria-label={`Select checker for ${item.name}`}
                                    >
                                      <SelectValue placeholder="Select checker" className="truncate" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(personnelGroups)
                                        .filter(([group]) => {
                                          if (item.name.includes("MRV EMT Bag")) {
                                            return group === "REGULARS";
                                          }
                                          return group !== "REGULARS";
                                        })
                                        .map(([group, members]) => (
                                        <React.Fragment key={group}>
                                          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{group}</div>
                                          {members && members.length > 0 ? members.map((checker) => (
                                            <SelectItem key={checker} value={checker} className="text-xs py-1.5">
                                              {checker}
                                            </SelectItem>
                                          )) : (
                                            <div className="px-2 py-1.5 text-xs text-muted-foreground/70">No personnel available</div>
                                          )}
                                          {group !== "ORNS/VES" && <div className="h-px my-1 bg-muted/50" />}
                                        </React.Fragment>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="col-span-2 flex justify-center">
                                  <div className="relative flex items-center justify-center w-full h-full">
                                    <Checkbox 
                                      id={`${section.title}-${item.id}-mobile`}
                                      checked={item.checked}
                                      onCheckedChange={(checked) => {
                                        setLastTapped({sectionIndex, itemIndex});
                                        setTimeout(() => setLastTapped(null), 50);
                                        handleCheckboxChange(sectionIndex, itemIndex, checked as boolean);
                                      }}
                                      className={cn(
                                        "h-6 w-6 cursor-pointer data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground transition-colors duration-50",
                                        highlightedCheckbox && 
                                        highlightedCheckbox.sectionIndex === sectionIndex && 
                                        highlightedCheckbox.itemIndex === itemIndex ? 
                                        "ring-2 ring-primary ring-offset-2 transition-all duration-50" : ""
                                      )}
                                      aria-label={`Mark ${item.name} as ${item.checked ? 'unchecked' : 'checked'}`}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </SwipeableRow>
                      ))}
                    </div>
                  )}
                  
                  {section.title === "BWC" && (
                    <div className="border-t border-gray-200 dark:border-gray-800">
                      <div className="grid grid-cols-12 px-3 py-1.5 bg-gray-50 dark:bg-neutral-800/50 text-[10px] font-medium text-muted-foreground">
                        <div className="col-span-4 truncate pr-1">Serial Number</div>
                        <div className="col-span-6 truncate pr-1">
                          <span className="pl-3">Assigned To</span>
                        </div>
                        <div className="col-span-2 text-center truncate">Status</div>
                      </div>
                      {section.items.map((item, itemIndex) => (
                        <SwipeableRow
                          key={item.id}
                          onEdit={() => handleEditItem(sectionIndex, itemIndex)}
                          onClear={() => handleClearItem(sectionIndex, itemIndex)}
                          isChecked={item.checked}
                        >
                          <div 
                            className={cn(
                              "border-t border-gray-100 dark:border-gray-800 first:border-t-0",
                              item.checked ? "bg-muted/40 dark:bg-muted/30" : "",
                              lastTapped && lastTapped.sectionIndex === sectionIndex && lastTapped.itemIndex === itemIndex 
                                ? "bg-muted/60 dark:bg-muted/50" : ""
                            )}
                            style={{ WebkitTapHighlightColor: 'transparent' }}
                          >
                            <div className="px-3 py-2">
                              <div className="grid grid-cols-12 items-center gap-2">
                                <div className="col-span-4 text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate">
                                  {item.name}
                                </div>
                                <div className="col-span-6">
                                  <Select
                                    value={item.assignedTo || ""}
                                    onValueChange={(value) => handleCheckerChange(sectionIndex, itemIndex, value)}
                                  >
                                    <SelectTrigger 
                                      className="w-full h-9 text-xs min-h-0 py-0 px-2 transition-all duration-100 active-feedback" 
                                      aria-label={`Select assignee for ${item.name}`}
                                    >
                                      <SelectValue placeholder="Assigned To" className="truncate" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(personnelGroups)
                                        .filter(([group]) => group !== "NS MARINE FIREFIGHTER")
                                        .map(([group, members]) => (
                                        <React.Fragment key={group}>
                                          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{group}</div>
                                          {members && members.length > 0 ? members.map((checker) => (
                                            <SelectItem key={checker} value={checker} className="text-xs py-1.5">
                                              {checker}
                                            </SelectItem>
                                          )) : (
                                            <div className="px-2 py-1.5 text-xs text-muted-foreground/70">No personnel available</div>
                                          )}
                                          {group !== "ORNS/VES" && <div className="h-px my-1 bg-muted/50" />}
                                        </React.Fragment>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="col-span-2 flex justify-center">
                                  <div className="relative flex items-center justify-center w-full h-full">
                                    <Checkbox 
                                      id={`${section.title}-${item.id}-mobile`}
                                      checked={item.checked}
                                      onCheckedChange={(checked) => {
                                        setLastTapped({sectionIndex, itemIndex});
                                        setTimeout(() => setLastTapped(null), 50);
                                        handleCheckboxChange(sectionIndex, itemIndex, checked as boolean);
                                      }}
                                      className={cn(
                                        "h-6 w-6 cursor-pointer data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground transition-colors duration-50",
                                        highlightedCheckbox && 
                                        highlightedCheckbox.sectionIndex === sectionIndex && 
                                        highlightedCheckbox.itemIndex === itemIndex ? 
                                        "ring-2 ring-primary ring-offset-2 transition-all duration-50" : ""
                                      )}
                                      aria-label={`Mark ${item.name} as ${item.checked ? 'unchecked' : 'checked'}`}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </SwipeableRow>
                      ))}
                    </div>
                  )}
                  
                  {isVehicleSection(section.title) && (
                    <div className="border-t border-gray-200 dark:border-gray-800">
                      {section.items.map((item, itemIndex) => (
                        <SwipeableRow
                          key={item.id}
                          onEdit={() => handleEditItem(sectionIndex, itemIndex)}
                          onClear={() => handleClearItem(sectionIndex, itemIndex)}
                          isChecked={item.checked}
                        >
                          <div 
                            className={cn(
                              "border-t border-gray-100 dark:border-gray-800 first:border-t-0",
                              item.checked ? "bg-muted/40 dark:bg-muted/30" : "",
                              lastTapped && lastTapped.sectionIndex === sectionIndex && lastTapped.itemIndex === itemIndex 
                                ? "bg-muted/60 dark:bg-muted/50" : ""
                            )}
                            style={{ WebkitTapHighlightColor: 'transparent' }}
                          >
                            {/* Top Row: Vehicle & Status */}
                            <div className="px-3 pt-2">
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex-1">
                                  <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate">
                                    {item.name}
                                  </div>
                                </div>
                                <div className="flex justify-end">
                                  <Checkbox 
                                    id={`${section.title}-${item.id}-mobile`}
                                    checked={item.checked}
                                    onCheckedChange={(checked) => {
                                      setLastTapped({sectionIndex, itemIndex});
                                      setTimeout(() => setLastTapped(null), 50);
                                      handleCheckboxChange(sectionIndex, itemIndex, checked as boolean);
                                    }}
                                    className={cn(
                                      "h-6 w-6 cursor-pointer data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground transition-colors duration-50",
                                      highlightedCheckbox && 
                                      highlightedCheckbox.sectionIndex === sectionIndex && 
                                      highlightedCheckbox.itemIndex === itemIndex ? 
                                      "ring-2 ring-primary ring-offset-2 transition-all duration-50" : ""
                                    )}
                                    aria-label={`Mark ${item.name} as ${item.checked ? 'unchecked' : 'checked'}`}
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Bottom Row: Checker, Fuel, ID */}
                            <div className="px-3 py-2">
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <Select
                                    key={`mobile-checker-${section.title}-${item.id}`}
                                    value={item.assignedTo || ""}
                                    onValueChange={(value) => handleCheckerChange(sectionIndex, itemIndex, value)}
                                  >
                                    <SelectTrigger 
                                      className="w-full h-9 text-xs min-h-0 py-0 px-2 transition-all duration-100 active-feedback" 
                                      aria-label={`Select checker for ${item.name}`}
                                    >
                                      <SelectValue placeholder="Checker" className="truncate" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(personnelGroups)
                                        .filter(([group]) => group === "REGULARS")
                                        .map(([group, members]) => (
                                          <React.Fragment key={group}>
                                            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{group}</div>
                                            {members && members.length > 0 ? members.map((checker) => (
                                              <SelectItem key={checker} value={checker} className="text-xs py-1.5">
                                                {checker}
                                              </SelectItem>
                                            )) : (
                                              <div className="px-2 py-1.5 text-xs text-muted-foreground/70">No personnel available</div>
                                            )}
                                          </React.Fragment>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div>
                                  <Select
                                    key={`mobile-fuel-${section.title}-${item.id}`}
                                    value={item.status || ""}
                                    onValueChange={(value) => handleStatusChange(sectionIndex, itemIndex, value)}
                                  >
                                    <SelectTrigger 
                                      className={cn(
                                        "w-full h-9 text-xs min-h-0 py-0 px-2 transition-all duration-100 active-feedback",
                                        item.assignedTo && (item.status === "Pending" || !item.status) &&
                                        "border-amber-400 bg-amber-50 dark:bg-amber-900/20 animate-pulse-medium"
                                      )}
                                      aria-label={`Select fuel level for ${item.name}`}
                                    >
                                      <SelectValue placeholder="Fuel Level" className="truncate" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {fuelLevels.map((level) => (
                                        <SelectItem key={level} value={level} className="text-xs py-1.5">
                                          {level}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div>
                                  <Input
                                    key={`mobile-id-${section.title}-${item.id}`}
                                    ref={(el) => { inputRefs.current[`${sectionIndex}-${itemIndex}`] = el; }}
                                    value={localIdentifiers[`${sectionIndex}-${itemIndex}`] ?? item.identifier ?? ""}
                                    onChange={(e) => handleIdentifierChange(sectionIndex, itemIndex, e.target.value)}
                                    onBlur={() => handleInputBlur(sectionIndex, itemIndex)}
                                    placeholder="Enter ID"
                                    className={cn(
                                      "w-full h-9 text-xs min-h-0 py-0 px-2 transition-all duration-100",
                                      item.assignedTo && !item.identifier && !localIdentifiers[`${sectionIndex}-${itemIndex}`] &&
                                      "border-amber-400 bg-amber-50 dark:bg-amber-900/20 animate-pulse-medium",
                                      animateInputs[`${sectionIndex}-${itemIndex}`] && "shadow-md scale-[1.02] border-amber-400"
                                    )}
                                    aria-label={`Enter response ID for ${item.name}`}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </SwipeableRow>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="flex flex-col md:flex-row gap-4 px-4 pb-4 pt-0 md:px-0">
          <Button
            onClick={handleResetVehicles}
            variant="outline"
            className="flex items-center justify-center md:justify-start w-full md:w-auto rounded-lg bg-white/50 dark:bg-transparent dark:hover:bg-neutral-800/50 backdrop-blur-sm border-neutral-200 dark:border-neutral-700 active:scale-[0.98] transition-transform active-feedback"
            aria-label="Reset vehicles to default values"
          >
            <span className="mr-2 text-neutral-600 dark:text-neutral-400 font-medium">Reset Vehicles</span>
          </Button>
          <Button
            onClick={handleReset}
            variant="outline"
            className="flex items-center justify-center md:justify-start w-full md:w-auto rounded-lg bg-white/50 dark:bg-transparent dark:hover:bg-neutral-800/50 backdrop-blur-sm border-neutral-200 dark:border-neutral-700 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 active:scale-[0.98] transition-transform active-feedback"
            aria-label="Reset all equipment"
          >
            <span className="mr-2 text-red-600 dark:text-red-400 font-medium">Reset All Equipment</span>
          </Button>
        </div>

        {/* Reset Vehicles Confirmation Dialog */}
        <Dialog open={isResetVehiclesDialogOpen} onOpenChange={setIsResetVehiclesDialogOpen}>
          <DialogContent className="max-w-[90%] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reset Vehicle Entries</DialogTitle>
              <DialogDescription>
                This will reset all vehicle names and plate numbers to their default values.
                This is useful if vehicle entries have become inconsistent or mixed up.
                Existing check statuses and assignments will be preserved.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-3 mt-4">
              <Button
                variant="outline"
                onClick={() => setIsResetVehiclesDialogOpen(false)}
                className="h-9 text-sm"
              >
                Cancel
              </Button>
              <Button
                variant="default"
                onClick={handleResetVehicles}
                className="h-9 text-sm"
                disabled={isSaving}
              >
                {isSaving ? "Resetting..." : "Reset Vehicles"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Reset Confirmation Dialog */}
        <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
          <DialogContent className="max-w-[90%] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reset Equipment Checklist</DialogTitle>
              <DialogDescription>
                Are you sure you want to reset all equipment? This will clear all assignments, statuses, and response IDs.
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-3 mt-4">
              <Button
                variant="outline"
                onClick={() => setIsResetDialogOpen(false)}
                className="h-9 text-sm"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReset}
                disabled={isSaving}
                className="h-9 text-sm"
              >
                {isSaving ? 'Resetting...' : 'Reset All'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Edit Vehicle Dialog */}
        <Dialog open={isEditVehicleDialogOpen} onOpenChange={setIsEditVehicleDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingVehicle && sections[editingVehicle.sectionIndex]?.title === "ARMOURY"
                  ? "Edit Armoury Item"
                  : editingVehicle && sections[editingVehicle.sectionIndex]?.title === "BWC"
                  ? "Edit BWC Serial Number"
                  : "Edit Vehicle"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">
                  {editingVehicle && sections[editingVehicle.sectionIndex]?.title === "ARMOURY"
                    ? "Armoury Item Name"
                    : editingVehicle && sections[editingVehicle.sectionIndex]?.title === "BWC"
                    ? "Serial Number"
                    : "Vehicle Name"}
                </Label>
                <Input
                  id="name"
                  value={editingVehicle?.name || ''}
                  onChange={(e) => setEditingVehicle(prev => prev ? { ...prev, name: e.target.value } : null)}
                  placeholder={
                    editingVehicle && sections[editingVehicle.sectionIndex]?.title === "ARMOURY"
                      ? "e.g., LF811"
                      : editingVehicle && sections[editingVehicle.sectionIndex]?.title === "BWC"
                      ? "e.g., G0247 8417"
                      : "e.g., CFS FRC"
                  }
                />
              </div>
              {editingVehicle && (sections[editingVehicle.sectionIndex]?.title === "VEHICLE FPT" || sections[editingVehicle.sectionIndex]?.title === "VEHICLE LPT") && (
                <div className="space-y-2">
                  <Label htmlFor="plateNumber">Plate Number</Label>
                  <Input
                    id="plateNumber"
                    value={editingVehicle?.plateNumber || ''}
                    onChange={(e) => setEditingVehicle(prev => prev ? { ...prev, plateNumber: e.target.value } : null)}
                    placeholder="e.g., QX1859E"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditVehicleDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveVehicle} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
} 
