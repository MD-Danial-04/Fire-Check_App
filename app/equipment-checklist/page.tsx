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
  
  // Add state to track pending updates by field ID
  const [pendingUpdates, setPendingUpdates] = useState<Set<string>>(new Set());
  
  // Add state to track item versions for conflict resolution
  const itemVersions = useRef<Record<string, number>>({});

  // Add state for Add Vehicle dialog
  const [isAddVehicleDialogOpen, setIsAddVehicleDialogOpen] = useState(false);
  const [newVehicleName, setNewVehicleName] = useState("");
  const [newPlateNumber, setNewPlateNumber] = useState("");

  // Add state for remove vehicle dialog
  const [isRemoveVehicleDialogOpen, setIsRemoveVehicleDialogOpen] = useState(false);
  const [vehicleToRemove, setVehicleToRemove] = useState<{ itemId: number; name: string } | null>(null);

  // Add state for Add BWC dialog
  const [isAddBwcDialogOpen, setIsAddBwcDialogOpen] = useState(false);
  const [newBwcSerial, setNewBwcSerial] = useState("");
  const [isAddingBwc, setIsAddingBwc] = useState(false);
  // Add state for Remove BWC dialog
  const [isRemoveBwcDialogOpen, setIsRemoveBwcDialogOpen] = useState(false);
  const [bwcToRemove, setBwcToRemove] = useState<{ itemId: number; name: string } | null>(null);

  // Fetch personnel data efficiently
  useEffect(() => {
    async function fetchPersonnel() {
      try {
        console.log('Fetching personnel data...');
        
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
            'CPT': 1,
            'LTA': 2,
            'WO2': 3,
            'WO1': 4,
            'SSG': 5,
            'SGT3': 6,
            'SGT2': 7,
            // Firefighters
            'SGT1': 8,
            'SGT': 9,
            'CPL': 10,
            'LCP': 11
          };
          return rankOrder[rank] || 999; // Default high number for unknown ranks
        };

        // Sort each group
        Object.keys(grouped).forEach(category => {
          grouped[category].sort((a, b) => {
            const orderA = getRankOrder(a);
            const orderB = getRankOrder(b);
            if (orderA !== orderB) return orderA - orderB;
            // If same rank, sort alphabetically by name (excluding rank)
            const nameA = a.split(' ').slice(1).join(' ').toUpperCase();
            const nameB = b.split(' ').slice(1).join(' ').toUpperCase();
            return nameA.localeCompare(nameB);
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
    "Pending",
    "Servicing"
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
        { id: 10, name: "FX7508623", checked: false },
        { id: 11, name: "FX7508614", checked: false },
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
          { id: 10, name: "FX7508623", checked: false },
          { id: 11, name: "FX7508614", checked: false },
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
        const order = ['ARMOURY', 'VEHICLE LPT', 'VEHICLE FPT', 'BWC'];
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
  const saveItemToDatabase = useCallback(async (sectionTitle: string, item: ChecklistItem) => {
    setIsSaving(true);

    // Generate a unique key for this item update
    const itemKey = `${sectionTitle}-${item.id}`;
    
    // Track version for this update
    const currentVersion = (itemVersions.current[itemKey] || 0) + 1;
    itemVersions.current[itemKey] = currentVersion;
    
    // Add to pending updates
    setPendingUpdates(prev => {
      const newPendingUpdates = new Set(prev);
      newPendingUpdates.add(itemKey);
      return newPendingUpdates;
    });

    // Store the original value for rollback in case of error
    const originalItems = sections.find(s => s.title === sectionTitle)?.items || [];
    const originalItem = originalItems.find(i => i.id === item.id);
    const rollbackData = originalItem ? { ...originalItem } : null;

    try {
      // Generate SQL that properly handles null values - we need to explicitly 
      // set assigned_to, status, and identifier to null when they should be cleared
      const { data, error } = await supabase
        .from('equipment_checklist')
        .update({
          checked: item.checked,
          assigned_to: item.assignedTo === undefined ? null : item.assignedTo,
          status: item.status === undefined ? null : item.status,
          identifier: item.identifier === undefined ? null : item.identifier,
          updated_at: new Date().toISOString(),
        })
        .eq('section', sectionTitle)
        .eq('item_id', item.id);

      if (error) {
        console.error('Error saving item:', error);
        throw error;
      }

      // Check if this was the latest version when we get the response
      if (itemVersions.current[itemKey] === currentVersion) {
        console.log('Item saved successfully:', item.id);
        
        // Show a minimal toast only when performing major updates like clearing items
        if (item.checked === false && !item.assignedTo && !item.status && !item.identifier) {
          toast({
            title: "Cleared",
            description: `${sectionTitle}: ${item.name} has been cleared`,
            duration: 2000,
          });
        }
      }
    } catch (error) {
      console.error('Failed to save item:', error);
      
      // Only rollback if this was the latest version
      if (itemVersions.current[itemKey] === currentVersion && rollbackData) {
        // Rollback the state change
        setSections(prevSections => {
          const sectionIndex = prevSections.findIndex(s => s.title === sectionTitle);
          if (sectionIndex === -1) return prevSections;
          
          const updatedSections = [...prevSections];
          const updatedItems = [...updatedSections[sectionIndex].items];
          const itemIndex = updatedItems.findIndex(i => i.id === item.id);
          
          if (itemIndex !== -1) {
            updatedItems[itemIndex] = rollbackData;
            updatedSections[sectionIndex] = {
              ...updatedSections[sectionIndex],
              items: updatedItems
            };
          }
          
          return updatedSections;
        });
        
        // Show error toast
        toast({
          title: "Error",
          description: "Failed to save changes. Please try again.",
          variant: "destructive"
        });
      }
    } finally {
      // Only remove from pending if this was the latest version
      if (itemVersions.current[itemKey] === currentVersion) {
        setPendingUpdates(prev => {
          const newPendingUpdates = new Set(prev);
          newPendingUpdates.delete(itemKey);
          return newPendingUpdates;
        });
      }
      
      setIsSaving(false);
    }
  }, [sections, supabase, toast]);

  // Optimize the fetchEquipmentData function
  const fetchEquipmentData = async () => {
    try {
      setFetchError(null);
      console.log('Fetching equipment checklist data...');
      
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
      const sectionOrder = ["ARMOURY", "VEHICLE LPT", "VEHICLE FPT", "BWC"];
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
        
        // Skip if this is an echo of our own update that we're still processing
        if (pendingUpdates.has(itemKey)) {
          console.log(`Skipping event for ${itemKey} - update is still pending`);
          return;
        }
        
        // Skip if the user is currently editing this field
        if (activeEditingFields.has(itemKey)) {
          console.log(`Skipping event for ${itemKey} - user is currently editing`);
          return;
        }
        
        // Skip if this is an echo of our own update we already processed
        if (lastProcessedUpdates.current[itemKey] === payloadHash) {
          console.log(`Skipping event for ${itemKey} - matches our last update`);
          return;
        }
        
        console.log(`Real-time update received (${eventType}):`, payload);
        
        // For small changes, update state directly instead of refetching
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
            
            // Add a brief animation to the item that was updated remotely
            if (updatedItem.checked !== currentItem.checked) {
              setHighlightedCheckbox({ sectionIndex, itemIndex });
              requestAnimationFrame(() => {
                setTimeout(() => {
                  setHighlightedCheckbox(null);
                }, 800);
              });
            }
            
            // If the identifier or status changed, add a brief animation to that field
            if (
              updatedItem.identifier !== currentItem.identifier || 
              updatedItem.status !== currentItem.status
            ) {
              setAnimateInputs(prev => ({
                ...prev,
                [`${sectionIndex}-${itemIndex}`]: true
              }));
              
              setTimeout(() => {
                setAnimateInputs(prev => ({
                  ...prev,
                  [`${sectionIndex}-${itemIndex}`]: false
                }));
              }, 800);
            }
            
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
  }, [supabase, fetchEquipmentData, activeEditingFields, pendingUpdates, setHighlightedCheckbox, setAnimateInputs]);

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

  const handleCheckboxChange = useCallback((sectionIndex: number, itemIndex: number, checked: boolean) => {
    // Skip if already saving to prevent duplicate updates
    if (isSaving) return;
    
    const currentItem = sections[sectionIndex].items[itemIndex];
    
    // Skip if state isn't actually changing
    if (currentItem.checked === checked) return;

    // Create a unique key for this item
    const itemKey = `${sections[sectionIndex].title}-${currentItem.id}`;
    
    // Skip if this item is already being updated
    if (pendingUpdates.has(itemKey)) return;
    
    // Create a new item with updated checked status
    const updatedItem = {
      ...currentItem,
      checked
    };

    // Track this update to prevent echo effects
    lastProcessedUpdates.current[itemKey] = JSON.stringify({
      section: sections[sectionIndex].title,
      item_id: currentItem.id,
      checked
    });
    
    // Update state immediately for better responsiveness
    setSections(prevSections => {
      const updatedSections = [...prevSections];
      const updatedItems = [...updatedSections[sectionIndex].items];
      updatedItems[itemIndex] = updatedItem;
      updatedSections[sectionIndex] = {
        ...updatedSections[sectionIndex],
        items: updatedItems
      };
      return updatedSections;
    });
    
    // Show brief highlight animation when checking
    if (checked) {
      setHighlightedCheckbox({ sectionIndex, itemIndex });
      requestAnimationFrame(() => {
        setTimeout(() => {
          setHighlightedCheckbox(null);
        }, 600); // Increased from 50 to 600ms for better visibility
      });
    }
    
    // Save to database immediately, saveItemToDatabase will handle pending state
    saveItemToDatabase(
      sections[sectionIndex].title,
      updatedItem
    );
  }, [sections, isSaving, saveItemToDatabase, pendingUpdates]);

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
    }
    
    // Use a more targeted state update approach
    setSections(prevSections => {
      const updatedSections = [...prevSections];
      const updatedItems = [...updatedSections[sectionIndex].items];
      updatedItems[itemIndex] = updatedItem;
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
      const updatedItems = [...updatedSections[sectionIndex].items];
      updatedItems[itemIndex] = updatedItem;
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

  const handleClearItem = (sectionIndex: number, itemIndex: number) => {
    const currentItem = sections[sectionIndex].items[itemIndex];
    const key = `${sectionIndex}-${itemIndex}`;
    
    // Skip if item is already cleared
    if (!currentItem.checked && !currentItem.assignedTo && !currentItem.status && !currentItem.identifier) {
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
    
    // Clear the local identifier state
    setLocalIdentifiers(prev => {
      const newState = { ...prev };
      delete newState[key];
      return newState;
    });
    
    // Use a more targeted state update approach
    setSections(prevSections => {
      const updatedSections = [...prevSections];
      const updatedItems = [...updatedSections[sectionIndex].items];
      updatedItems[itemIndex] = clearedItem;
      updatedSections[sectionIndex] = {
        ...updatedSections[sectionIndex],
        items: updatedItems
      };
      return updatedSections;
    });
    
    console.log('Clearing item:', sections[sectionIndex].title, currentItem.id);
    
    // Save to database using the clearedItem
    // The saveItemToDatabase function will convert undefined to null
    saveItemToDatabase(
      sections[sectionIndex].title,
      clearedItem
    );
  };

  const isVehicleSection = (title: string) => {
    return title === "VEHICLE FPT" || title === "VEHICLE LPT";
  };

  const getSectionTitleForDisplay = (title: string) => {
    if (title === "VEHICLE LPT") return "VEHICLE ARMOURY";
    return title;
  };

  const handleRefresh = async () => {
    try {
      await fetchEquipmentData();
    } catch (error) {
      console.error('Error refreshing equipment checklist:', error);
      setSaveError('An unexpected error occurred while refreshing');
    }
  };

  const handleEditItem = (sectionIndex: number, itemIndex: number) => {
    const item = sections[sectionIndex].items[itemIndex];
    const isVehicle = isVehicleSection(sections[sectionIndex].title);
    
    if (isVehicle) {
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
        const updatedItems = [...updatedSections[sectionIndex].items];
        updatedItems[itemIndex] = updatedItem;
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
    }, 300);
    
    // Add to pending saves
    setPendingSaves(prev => ({
      ...prev,
      [key]: timeoutId
    }));
  }, [sections, activeEditingFields, pendingSaves]);

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
          const updatedItems = [...updatedSections[sectionIndex].items];
          updatedItems[itemIndex] = updatedItem;
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

  const handleResetVehicles = async () => {
    try {
      setIsSaving(true);
      setSaveError(null);
      setIsResetVehiclesDialogOpen(false);

      // Default vehicle data
      const defaultVehiclesFPT = [
        { id: 1, name: "CFS FRC (QX1859E)" },
        { id: 2, name: "Class 4 Truck (YN4304C)" },
        { id: 3, name: "LF811 (GDB7755P)" },
        { id: 4, name: "LF812 (GBD6351C)" },
        { id: 5, name: "Admin FRC (QX1034T)" },
        { id: 6, name: "Spare LF (GBF8661J)" }
      ];

      const defaultVehiclesLPT = [
        { id: 1, name: "CFS FRC (QX1859E)" },
        { id: 2, name: "Class 4 Truck (YN4304C)" },
        { id: 3, name: "LF811 (GBF8661J)" },
        { id: 4, name: "LF812 (GBD6351C)" },
        { id: 5, name: "Admin FRC (QX1034T)" },
        { id: 6, name: "Spare LF (GBD7755P)" }
      ];

      // Update vehicles in both sections
      for (const vehicle of defaultVehiclesFPT) {
        await supabase
          .from('equipment_checklist')
          .update({ name: vehicle.name })
          .eq('section', 'VEHICLE FPT')
          .eq('item_id', vehicle.id);
      }

      for (const vehicle of defaultVehiclesLPT) {
        await supabase
          .from('equipment_checklist')
          .update({ name: vehicle.name })
          .eq('section', 'VEHICLE LPT')
          .eq('item_id', vehicle.id);
      }

      // Refresh data
      await fetchEquipmentData();

      toast({
        title: "Success",
        description: "Vehicle entries have been reset to their default values.",
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

  const handleSaveVehicle = async () => {
    if (!editingVehicle) return;

    const { sectionIndex, itemIndex, name, plateNumber } = editingVehicle;
    const section = sections[sectionIndex];
    const item = section.items[itemIndex];
    const isVehicle = isVehicleSection(section.title);
    const newName = isVehicle ? `${name} (${plateNumber})` : name;

    try {
      setIsSaving(true);
      
      // For vehicle sections, update both FPT and LPT in DB to keep them in sync,
      // even though LPT is hidden in the UI.
      if (isVehicle) {
        const updates = [
          {
            section: section.title,
            item_id: item.id,
            name: newName
          }
        ];
        
        // Find corresponding entry in other section
        const otherSectionTitle = section.title === "VEHICLE FPT" ? "VEHICLE LPT" : "VEHICLE FPT";
        const otherSection = sections.find(s => s.title === otherSectionTitle);
        
        if (otherSection) {
          const correspondingItem = otherSection.items.find(i => i.id === item.id);
          if (correspondingItem) {
            updates.push({
              section: otherSectionTitle,
              item_id: item.id,
              name: newName
            });
          }
        }

        // Update all matching entries
        for (const update of updates) {
          await supabase
            .from('equipment_checklist')
            .update({ name: update.name })
            .eq('section', update.section)
            .eq('item_id', update.item_id);
        }

        // Update local state
        setSections(prevSections => {
          const newSections = [...prevSections];
          updates.forEach(update => {
            const sectionIndex = newSections.findIndex(s => s.title === update.section);
            if (sectionIndex !== -1) {
              const itemIndex = newSections[sectionIndex].items.findIndex(i => i.id === update.item_id);
              if (itemIndex !== -1) {
                newSections[sectionIndex].items[itemIndex].name = update.name;
              }
            }
          });
          return newSections;
        });

        toast({
          title: "Success",
          description: `Vehicle updated successfully in ${updates.length} section${updates.length > 1 ? 's' : ''}`,
        });
      } else {
        // For non-vehicle sections, just update the single item
        await supabase
          .from('equipment_checklist')
          .update({ name: newName })
          .eq('section', section.title)
          .eq('item_id', item.id);

        // Update local state
        setSections(prevSections => {
          const newSections = [...prevSections];
          newSections[sectionIndex].items[itemIndex].name = newName;
          return newSections;
        });

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

  // First, let's add a utility function for checking if a field is pending update
  const isItemPending = useCallback((sectionIndex: number, itemIndex: number) => {
    if (!sections[sectionIndex] || !sections[sectionIndex].items[itemIndex]) return false;
    
    const itemKey = `${sections[sectionIndex].title}-${sections[sectionIndex].items[itemIndex].id}`;
    return pendingUpdates.has(itemKey);
  }, [sections, pendingUpdates]);

  // Add handler for adding a vehicle to both FPT and LPT
  const handleAddVehicle = async () => {
    if (!newVehicleName.trim() || !newPlateNumber.trim()) return;
    setIsSaving(true);
    try {
      // Find max item_id in both VEHICLE FPT and VEHICLE LPT
      const { data: fpt, error: fptError } = await supabase
        .from('equipment_checklist')
        .select('item_id')
        .eq('section', 'VEHICLE FPT')
        .order('item_id', { ascending: false })
        .limit(1);
      const { data: lpt, error: lptError } = await supabase
        .from('equipment_checklist')
        .select('item_id')
        .eq('section', 'VEHICLE LPT')
        .order('item_id', { ascending: false })
        .limit(1);
      if (fptError || lptError) {
        toast({ title: 'Error', description: 'Failed to fetch vehicle IDs', variant: 'destructive' });
        setIsSaving(false);
        return;
      }
      const maxFpt = fpt?.[0]?.item_id || 0;
      const maxLpt = lpt?.[0]?.item_id || 0;
      const nextItemId = Math.max(maxFpt, maxLpt) + 1;
      const name = `${newVehicleName.trim()} (${newPlateNumber.trim()})`;
      const now = new Date().toISOString();
      const { error: insertError } = await supabase
        .from('equipment_checklist')
        .insert([
          {
            section: 'VEHICLE FPT',
            item_id: nextItemId,
            name,
            checked: false,
            assigned_to: null,
            status: null,
            identifier: null,
            created_at: now,
            updated_at: now,
          },
          {
            section: 'VEHICLE LPT',
            item_id: nextItemId,
            name,
            checked: false,
            assigned_to: null,
            status: null,
            identifier: null,
            created_at: now,
            updated_at: now,
          }
        ]);
      if (insertError) {
        toast({ title: 'Error', description: 'Failed to add vehicle', variant: 'destructive' });
        setIsSaving(false);
        return;
      }
      setIsAddVehicleDialogOpen(false);
      setNewVehicleName("");
      setNewPlateNumber("");
      await fetchEquipmentData();
      toast({ title: 'Success', description: 'Vehicle added to both FPT and LPT.' });
    } catch (e) {
      toast({ title: 'Error', description: 'Unexpected error adding vehicle', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // Handler to remove vehicle from both VEHICLE FPT and VEHICLE LPT
  const handleRemoveVehicle = async () => {
    if (!vehicleToRemove) return;
    setIsSaving(true);
    try {
      await supabase
        .from('equipment_checklist')
        .delete()
        .in('section', ['VEHICLE FPT', 'VEHICLE LPT'])
        .eq('item_id', vehicleToRemove.itemId);
      setIsRemoveVehicleDialogOpen(false);
      setVehicleToRemove(null);
      await fetchEquipmentData();
      // Ensure dialogs are closed before showing toast (fix for mobile)
      setTimeout(() => {
        toast({ title: 'Vehicle removed.', duration: 2000 });
      }, 150);
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to remove vehicle', variant: 'destructive', duration: 3000 });
    } finally {
      setIsSaving(false);
    }
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
                className="h-8 sm:h-10 px-2 sm:px-4 flex items-center gap-1"
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
                  <CardTitle className="text-base sm:text-lg">{getSectionTitleForDisplay(section.title)}</CardTitle>
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
                      <Link href="https://form.gov.sg/688c1f79f7a36974c578d8df" target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        <span className="hidden sm:inline">Open Vehicle Form</span>
                        <span className="sm:hidden">Form</span>
                      </Link>
                    </Button>
                  )}
                  {(section.title === "VEHICLE FPT" || section.title === "VEHICLE LPT") && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3 flex items-center gap-1 sm:gap-2 border-green-500 text-green-600 hover:bg-green-50 dark:border-green-400 dark:text-green-400 dark:hover:bg-green-900/20"
                      onClick={() => setIsAddVehicleDialogOpen(true)}
                      aria-label="Add Vehicle"
                    >
                      + Add Vehicle
                    </Button>
                  )}
                  {section.title === "BWC" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3 flex items-center gap-1 sm:gap-2 border-blue-500 text-blue-600 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-900/20"
                      onClick={() => setIsAddBwcDialogOpen(true)}
                      aria-label="Add BWC"
                      disabled={isAddingBwc}
                    >
                      + Add BWC
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
                                    onCheckedChange={(checked) => 
                                      handleCheckboxChange(sectionIndex, itemIndex, checked as boolean)
                                    }
                                    className={cn(
                                      "h-5 w-5 cursor-pointer",
                                      "data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
                                      "transition-all duration-100 ease-in-out",
                                      "hover:scale-105",
                                      "active:scale-95",
                                      "transform-gpu",
                                      isItemPending(sectionIndex, itemIndex) ? "opacity-60 after:absolute after:inset-0 after:animate-pulse" : "",
                                      highlightedCheckbox && 
                                      highlightedCheckbox.sectionIndex === sectionIndex && 
                                      highlightedCheckbox.itemIndex === itemIndex ? 
                                      "ring-2 ring-primary ring-offset-2 animate-pulse" : ""
                                    )}
                                    aria-label={`Mark ${item.name} as checked`}
                                    disabled={isItemPending(sectionIndex, itemIndex)}
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
                                    <SelectTrigger 
                                      className="w-full h-10 text-xs transition-all duration-150 border"
                                      aria-label={`Select checker for ${item.name}`}
                                    >
                                      <SelectValue placeholder="Select checker" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(personnelGroups)
                                        .filter(([group]) => {
                                          // For MRV811 EMT Bag 1 and 2, only show REGULARS
                                          if (["MRV811 EMT Bag 1", "MRV811 EMT Bag 2"].includes(item.name.trim())) {
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
                                      className="w-full h-10 text-xs transition-all duration-150 border"
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
                                    <SelectTrigger className={cn(
                                        "w-full transition-all duration-150 border",
                                        "focus:border-amber-300 focus:ring-amber-500",
                                        item.assignedTo && (item.status === "Pending" || !item.status)
                                          ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20 animate-pulse-medium" 
                                          : ""
                                    )}>
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
                                        isItemPending(sectionIndex, itemIndex) ? "bg-blue-50/20 border-blue-300 dark:bg-blue-900/10" : "",
                                        item.assignedTo && !item.identifier && !localIdentifiers[`${sectionIndex}-${itemIndex}`]
                                          ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20 animate-pulse-medium" 
                                          : "",
                                        animateInputs[`${sectionIndex}-${itemIndex}`] 
                                          ? "shadow-md scale-[1.02] border-amber-400" 
                                          : ""
                                      )}
                                      aria-label="Response ID input"
                                      tabIndex={0}
                                      disabled={isItemPending(sectionIndex, itemIndex)}
                                    />
                                    {isItemPending(sectionIndex, itemIndex) && (
                                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                                        <div className="w-3 h-3 rounded-full bg-blue-400 opacity-75 animate-pulse"></div>
                                      </div>
                                    )}
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
                                    <SelectTrigger 
                                      className="w-full h-10 text-xs transition-all duration-150 border"
                                      aria-label={`Select personnel for ${item.name}`}
                                    >
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
                <div className="md:hidden touch-manipulation">
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
                          <div className={cn(
                            "border-t border-gray-100 dark:border-gray-800 first:border-t-0",
                            item.checked ? "bg-muted/40 dark:bg-muted/30" : ""
                          )}>
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
                                      className="w-full h-7 text-xs min-h-0 py-0 px-2"
                                      aria-label={`Select checker for ${item.name}`}
                                    >
                                      <SelectValue placeholder="Select checker" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(personnelGroups)
                                        .filter(([group]) => {
                                          // For MRV811 EMT Bag 1 and 2, only show REGULARS
                                          if (["MRV811 EMT Bag 1", "MRV811 EMT Bag 2"].includes(item.name.trim())) {
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
                                </div>
                                <div className="col-span-2 flex justify-center">
                                  <Checkbox 
                                    id={`${section.title}-${item.id}-mobile`}
                                    checked={item.checked}
                                    onCheckedChange={(checked) => 
                                      handleCheckboxChange(sectionIndex, itemIndex, checked as boolean)
                                    }
                                  />
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
                          <div className={cn(
                            "border-t border-gray-100 dark:border-gray-800 first:border-t-0",
                            item.checked ? "bg-muted/40 dark:bg-muted/30" : ""
                          )}>
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
                                      className="w-full h-7 text-xs min-h-0 py-0 px-2"
                                      aria-label={`Select checker for ${item.name}`}
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
                                </div>
                                <div className="col-span-2 flex justify-center">
                                  <Checkbox 
                                    id={`${section.title}-${item.id}-mobile`}
                                    checked={item.checked}
                                    onCheckedChange={(checked) => 
                                      handleCheckboxChange(sectionIndex, itemIndex, checked as boolean)
                                    }
                                  />
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
                          <div className={cn(
                            "border-t border-gray-100 dark:border-gray-800 first:border-t-0",
                            item.checked ? "bg-muted/40 dark:bg-muted/30" : ""
                          )}>
                            {/* Top Row: Vehicle & Status */}
                            <div className="px-3 pt-2">
                              <div className="grid grid-cols-12 items-center">
                                <div className="col-span-10">
                                  <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate">
                                    {item.name}
                                  </div>
                                </div>
                                <div className="col-span-2 flex justify-center">
                                  <Checkbox 
                                    id={`${section.title}-${item.id}-mobile`}
                                    checked={item.checked}
                                    onCheckedChange={(checked) => 
                                      handleCheckboxChange(sectionIndex, itemIndex, checked as boolean)
                                    }
                                    className={cn(
                                      "h-5 w-5 cursor-pointer",
                                      "data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
                                      "transition-all duration-100 ease-in-out",
                                      "hover:scale-105",
                                      "active:scale-95",
                                      "transform-gpu",
                                      isItemPending(sectionIndex, itemIndex) ? "opacity-60 after:absolute after:inset-0 after:animate-pulse" : "",
                                      highlightedCheckbox && 
                                      highlightedCheckbox.sectionIndex === sectionIndex && 
                                      highlightedCheckbox.itemIndex === itemIndex ? 
                                      "ring-2 ring-primary ring-offset-2 animate-pulse" : ""
                                    )}
                                    aria-label={`Mark ${item.name} as checked`}
                                    disabled={isItemPending(sectionIndex, itemIndex)}
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
                                      className="w-full h-7 text-xs min-h-0 py-0 px-2" 
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
                                </div>

                                <div>
                                  <Select
                                    key={`mobile-fuel-${section.title}-${item.id}`}
                                    value={item.status || ""}
                                    onValueChange={(value) => handleStatusChange(sectionIndex, itemIndex, value)}
                                  >
                                    <SelectTrigger className={cn(
                                      "w-full h-7 text-xs min-h-0 py-0 px-2",
                                      item.assignedTo && (item.status === "Pending" || !item.status) &&
                                      "border-amber-400 bg-amber-50 dark:bg-amber-900/20 animate-pulse-medium"
                                    )}>
                                      <SelectValue placeholder="Fuel Level" className="truncate" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {fuelLevels.map((level) => (
                                        <SelectItem key={level} value={level} className="text-xs py-1">
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
                                      "w-full h-7 text-xs min-h-0 py-0 px-2",
                                      item.assignedTo && !item.identifier && !localIdentifiers[`${sectionIndex}-${itemIndex}`] &&
                                      "border-amber-400 bg-amber-50 dark:bg-amber-900/20 animate-pulse-medium",
                                      animateInputs[`${sectionIndex}-${itemIndex}`] && "shadow-md scale-[1.02] border-amber-400"
                                    )}
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
            onClick={() => setIsResetVehiclesDialogOpen(true)}
            variant="outline"
            className="flex items-center justify-center md:justify-start w-full md:w-auto rounded-lg bg-white/50 dark:bg-transparent dark:hover:bg-neutral-800/50 backdrop-blur-sm border-neutral-200 dark:border-neutral-700"
          >
            <span className="mr-2 text-neutral-600 dark:text-neutral-400 font-medium">Reset Vehicles</span>
          </Button>
          <Button
            onClick={() => setIsResetDialogOpen(true)}
            variant="outline"
            className="flex items-center justify-center md:justify-start w-full md:w-auto rounded-lg bg-white/50 dark:bg-transparent dark:hover:bg-neutral-800/50 backdrop-blur-sm border-neutral-200 dark:border-neutral-700 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
          >
            <span className="mr-2 text-red-600 dark:text-red-400 font-medium">Reset All Equipment</span>
          </Button>
        </div>

        {/* Reset Vehicles Confirmation Dialog */}
        <Dialog open={isResetVehiclesDialogOpen} onOpenChange={setIsResetVehiclesDialogOpen}>
          <DialogContent className="max-w-[90%] sm:max-w-md p-4 sm:p-6">
            <DialogHeader className="space-y-2">
              <DialogTitle className="text-base sm:text-lg">Reset Vehicle Entries</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                This will reset all vehicle names and plate numbers to their default values.
                This is useful if vehicle entries have become inconsistent or mixed up.
                Existing check statuses and assignments will be preserved.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 sm:gap-3 mt-2 sm:mt-4">
              <Button
                variant="outline"
                onClick={() => setIsResetVehiclesDialogOpen(false)}
                className="h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
              >
                Cancel
              </Button>
              <Button
                variant="default"
                onClick={handleResetVehicles}
                className="h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
                disabled={isSaving}
              >
                {isSaving ? "Resetting..." : "Reset Vehicles"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Reset Confirmation Dialog */}
        <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
          <DialogContent className="max-w-[90%] sm:max-w-md p-4 sm:p-6">
            <DialogHeader className="space-y-2">
              <DialogTitle className="text-base sm:text-lg">Reset Equipment Checklist</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                Are you sure you want to reset all equipment? This will clear all assignments, statuses, and response IDs.
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 sm:gap-3 mt-2 sm:mt-4">
              <Button
                variant="outline"
                onClick={() => setIsResetDialogOpen(false)}
                className="h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReset}
                disabled={isSaving}
                className="h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
              >
                {isSaving ? 'Resetting...' : 'Reset All'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Edit Vehicle Dialog */}
        <Dialog open={isEditVehicleDialogOpen} onOpenChange={setIsEditVehicleDialogOpen}>
          <DialogContent className="max-w-[90%] sm:max-w-md p-4 sm:p-6">
            <DialogHeader className="space-y-2">
              <DialogTitle className="text-base sm:text-lg">
                {editingVehicle && sections[editingVehicle.sectionIndex]?.title === "ARMOURY"
                  ? "Edit Armoury Item"
                  : editingVehicle && sections[editingVehicle.sectionIndex]?.title === "BWC"
                  ? "Edit BWC Serial Number"
                  : "Edit Vehicle"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2 sm:py-4">
              <div className="space-y-1 sm:space-y-2">
                <Label htmlFor="name" className="text-xs sm:text-sm">
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
                  className="h-8 sm:h-10 text-xs sm:text-sm"
                />
              </div>
              {editingVehicle && (sections[editingVehicle.sectionIndex]?.title === "VEHICLE FPT" || sections[editingVehicle.sectionIndex]?.title === "VEHICLE LPT") && (
                <div className="space-y-1 sm:space-y-2">
                  <Label htmlFor="plateNumber" className="text-xs sm:text-sm">Plate Number</Label>
                  <Input
                    id="plateNumber"
                    value={editingVehicle?.plateNumber || ''}
                    onChange={(e) => setEditingVehicle(prev => prev ? { ...prev, plateNumber: e.target.value } : null)}
                    placeholder="e.g., QX1859E"
                    className="h-8 sm:h-10 text-xs sm:text-sm"
                  />
                </div>
              )}
            </div>
            <DialogFooter className="flex flex-col gap-2 sm:gap-3">
              <div className="flex flex-row-reverse gap-2 sm:gap-3 w-full">
                <Button 
                  onClick={handleSaveVehicle} 
                  disabled={isSaving}
                  className="h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setIsEditVehicleDialogOpen(false)}
                  className="h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
                >
                  Cancel
                </Button>
              </div>
              {editingVehicle && sections[editingVehicle.sectionIndex]?.title === "BWC" && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    setBwcToRemove({ itemId: sections[editingVehicle.sectionIndex].items[editingVehicle.itemIndex].id, name: sections[editingVehicle.sectionIndex].items[editingVehicle.itemIndex].name });
                    setIsEditVehicleDialogOpen(false);
                    setIsRemoveBwcDialogOpen(true);
                  }}
                  disabled={isSaving}
                  className="w-full mt-2 h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
                >
                  Remove BWC
                </Button>
              )}
              {editingVehicle && (sections[editingVehicle.sectionIndex]?.title === "VEHICLE FPT" || sections[editingVehicle.sectionIndex]?.title === "VEHICLE LPT") && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    setVehicleToRemove({ itemId: sections[editingVehicle.sectionIndex].items[editingVehicle.itemIndex].id, name: sections[editingVehicle.sectionIndex].items[editingVehicle.itemIndex].name });
                    setIsEditVehicleDialogOpen(false);
                    setIsRemoveVehicleDialogOpen(true);
                  }}
                  disabled={isSaving}
                  className="w-full mt-2 h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
                >
                  Remove Vehicle
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add the Add Vehicle Dialog at the bottom of the component */}
        <Dialog open={isAddVehicleDialogOpen} onOpenChange={setIsAddVehicleDialogOpen}>
          <DialogContent className="max-w-[90%] sm:max-w-md p-4 sm:p-6">
            <DialogHeader className="space-y-2">
              <DialogTitle className="text-base sm:text-lg">Add Vehicle to FPT & Vehicle Armoury</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                This will add a new vehicle to both VEHICLE FPT and VEHICLE ARMOURY sections with the same item ID.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2 sm:py-4">
              <div className="space-y-1 sm:space-y-2">
                <Label htmlFor="add-vehicle-name" className="text-xs sm:text-sm">Vehicle Name</Label>
                <Input
                  id="add-vehicle-name"
                  value={newVehicleName}
                  onChange={e => setNewVehicleName(e.target.value)}
                  placeholder="e.g., CFS FRC"
                  className="h-8 sm:h-10 text-xs sm:text-sm"
                />
              </div>
              <div className="space-y-1 sm:space-y-2">
                <Label htmlFor="add-vehicle-plate" className="text-xs sm:text-sm">Plate Number</Label>
                <Input
                  id="add-vehicle-plate"
                  value={newPlateNumber}
                  onChange={e => setNewPlateNumber(e.target.value)}
                  placeholder="e.g., QX1859E"
                  className="h-8 sm:h-10 text-xs sm:text-sm"
                />
              </div>
            </div>
            <DialogFooter className="sm:justify-end gap-2 sm:gap-3">
              <Button
                variant="outline"
                onClick={() => setIsAddVehicleDialogOpen(false)}
                className="h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddVehicle}
                disabled={isSaving || !newVehicleName.trim() || !newPlateNumber.trim()}
                className="h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
              >
                {isSaving ? 'Adding...' : 'Add Vehicle'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Remove Vehicle Dialog at the bottom of the component */}
        <Dialog open={isRemoveVehicleDialogOpen} onOpenChange={setIsRemoveVehicleDialogOpen}>
          <DialogContent className="max-w-[90%] sm:max-w-md p-4 sm:p-6">
            <DialogHeader className="space-y-2">
              <DialogTitle>Remove Vehicle</DialogTitle>
              <DialogDescription>
                Are you sure you want to remove <b>{vehicleToRemove?.name}</b> from both VEHICLE FPT and VEHICLE ARMOURY? This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="sm:justify-end gap-2 sm:gap-3">
              <Button
                variant="outline"
                onClick={() => setIsRemoveVehicleDialogOpen(false)}
                className="h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleRemoveVehicle}
                disabled={isSaving}
                className="h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
              >
                {isSaving ? 'Removing...' : 'Remove'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add BWC Dialog */}
        <Dialog open={isAddBwcDialogOpen} onOpenChange={setIsAddBwcDialogOpen}>
          <DialogContent className="max-w-[90%] sm:max-w-md p-4 sm:p-6">
            <DialogHeader className="space-y-2">
              <DialogTitle className="text-base sm:text-lg">Add BWC Serial Number</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                This will add a new BWC entry to the checklist with the next available ID.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2 sm:py-4">
              <div className="space-y-1 sm:space-y-2">
                <Label htmlFor="add-bwc-serial" className="text-xs sm:text-sm">Serial Number</Label>
                <Input
                  id="add-bwc-serial"
                  value={newBwcSerial}
                  onChange={e => setNewBwcSerial(e.target.value)}
                  placeholder="e.g., FX7508623"
                  className="h-8 sm:h-10 text-xs sm:text-sm"
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter className="sm:justify-end gap-2 sm:gap-3">
              <Button
                variant="outline"
                onClick={() => setIsAddBwcDialogOpen(false)}
                className="h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!newBwcSerial.trim()) return;
                  setIsAddingBwc(true);
                  try {
                    // Find max item_id in BWC section
                    const { data: bwcItems, error: bwcError } = await supabase
                      .from('equipment_checklist')
                      .select('item_id')
                      .eq('section', 'BWC')
                      .order('item_id', { ascending: false })
                      .limit(1);
                    if (bwcError) throw bwcError;
                    const maxId = bwcItems?.[0]?.item_id || 0;
                    const nextId = maxId + 1;
                    const now = new Date().toISOString();
                    const { error: insertError } = await supabase
                      .from('equipment_checklist')
                      .insert([
                        {
                          section: 'BWC',
                          item_id: nextId,
                          name: newBwcSerial.trim(),
                          checked: false,
                          assigned_to: null,
                          status: null,
                          identifier: null,
                          created_at: now,
                          updated_at: now,
                        }
                      ]);
                    if (insertError) throw insertError;
                    setIsAddBwcDialogOpen(false);
                    setNewBwcSerial("");
                    await fetchEquipmentData();
                    toast({ title: 'Success', description: 'BWC added.' });
                  } catch (e) {
                    toast({ title: 'Error', description: 'Failed to add BWC', variant: 'destructive' });
                  } finally {
                    setIsAddingBwc(false);
                  }
                }}
                disabled={isAddingBwc || !newBwcSerial.trim()}
                className="h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
              >
                {isAddingBwc ? 'Adding...' : 'Add BWC'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Remove BWC Dialog at the bottom of the component */}
        <Dialog open={isRemoveBwcDialogOpen} onOpenChange={setIsRemoveBwcDialogOpen}>
          <DialogContent className="max-w-[90%] sm:max-w-md p-4 sm:p-6">
            <DialogHeader className="space-y-2">
              <DialogTitle>Remove BWC</DialogTitle>
              <DialogDescription>
                Are you sure you want to remove <b>{bwcToRemove?.name}</b> from BWC? This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="sm:justify-end gap-2 sm:gap-3">
              <Button
                variant="outline"
                onClick={() => setIsRemoveBwcDialogOpen(false)}
                className="h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (!bwcToRemove) return;
                  setIsSaving(true);
                  try {
                    await supabase
                      .from('equipment_checklist')
                      .delete()
                      .eq('section', 'BWC')
                      .eq('item_id', bwcToRemove.itemId);
                    setIsRemoveBwcDialogOpen(false);
                    setBwcToRemove(null);
                    await fetchEquipmentData();
                    setTimeout(() => {
                      toast({ title: 'BWC removed.', duration: 2000 });
                    }, 150);
                  } catch (e) {
                    toast({ title: 'Error', description: 'Failed to remove BWC', variant: 'destructive', duration: 3000 });
                  } finally {
                    setIsSaving(false);
                  }
                }}
                disabled={isSaving}
                className="h-8 sm:h-9 text-xs sm:text-sm px-2 sm:px-3"
              >
                {isSaving ? 'Removing...' : 'Remove'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
} 
