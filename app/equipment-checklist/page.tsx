'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import Link from 'next/link'
import { ArrowLeft, X, ExternalLink, Trash2 } from 'lucide-react'
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
} from "@/components/ui/dialog"

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
  // Initialize Supabase client
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    }
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

  // Fetch personnel data from Supabase
  useEffect(() => {
    async function fetchPersonnel() {
      try {
        console.log('Fetching personnel data...');
        
        // Fetch personnel data
        const { data, error } = await supabase
          .from('personnel')
          .select('*')
          .order('name');
        
        if (error) {
          console.error('Error fetching personnel:', error);
          return;
        }

        if (!data?.length) {
          console.warn('No personnel data found');
          return;
        }

        console.log('Raw personnel data:', data);

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

        console.log('Processed personnel data:', grouped);
        setPersonnelData(grouped);
      } catch (error) {
        console.error('Error processing personnel data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchPersonnel();
  }, [supabase]);

  // Use the fallback data if Supabase data is loading or empty
  const personnelGroups = isLoading || Object.values(personnelData).every(group => group.length === 0) 
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

  // Debug log for personnelGroups
  useEffect(() => {
    console.log('Personnel groups for dropdown:', personnelGroups);
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

  // Define fetchEquipmentData as a useCallback to avoid recreation
  const fetchEquipmentData = useCallback(async () => {
      try {
        setIsLoading(true);
        console.log('Fetching equipment checklist data...');
        
        const { data, error } = await supabase
          .from('equipment_checklist')
          .select('*')
          .order('section')
          .order('item_id');
        
        if (error) {
          console.error('Error fetching equipment checklist data:', error);
          return;
        }

        if (!data?.length) {
          console.log('No equipment checklist data found, using default state');
          return;
        }

        console.log('Equipment checklist data:', data);
        
        // Transform the data into our sections format
        const newSections = [...sections];
        
        data.forEach(item => {
          const sectionIndex = newSections.findIndex(s => s.title === item.section);
          if (sectionIndex !== -1) {
            const itemIndex = newSections[sectionIndex].items.findIndex(i => i.id === item.item_id);
            if (itemIndex !== -1) {
              // Ensure we handle null values correctly
              newSections[sectionIndex].items[itemIndex] = {
                ...newSections[sectionIndex].items[itemIndex],
                checked: item.checked || false,
                // Convert null values to undefined for the UI
                assignedTo: item.assigned_to === null ? undefined : item.assigned_to,
                status: item.status === null ? undefined : item.status,
                identifier: item.identifier === null ? undefined : item.identifier
              };
              
              console.log(`Updated item from DB: ${item.section} - ${item.name}`, 
                {checked: item.checked, assignedTo: item.assigned_to, status: item.status, identifier: item.identifier});
            }
          }
        });
        
        setSections(newSections);
      } catch (error) {
        console.error('Error processing equipment checklist data:', error);
      } finally {
        setIsLoading(false);
      }
  }, [supabase]); // Remove sections from dependency array to break circular dependency

  // Set up real-time subscription and fetch initial data
  const setupRealtimeSubscription = useCallback(async (
    supabaseClient: typeof supabase, 
    editingFields: Set<string>
  ) => {
    try {
        // Create a new channel with a unique name
        const channelName = `equipment_checklist_${Date.now()}`;
      const channel = supabaseClient.channel(channelName);

        // Set up the listener before subscribing
        channel
          .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'equipment_checklist'
        }, (payload: any) => {
              console.log('Equipment checklist data changed, received payload:', payload);
              
              // If we have the payload data, we can update just that item
              if (payload.new && payload.eventType === 'UPDATE') {
                const newItem = payload.new;
                console.log('Processing update for item:', newItem);
                
                // Update the specific item in our state
                setSections(prevSections => {
                  const newSections = [...prevSections];
                  const sectionIndex = newSections.findIndex(s => s.title === newItem.section);
                  
                  if (sectionIndex !== -1) {
                    const itemIndex = newSections[sectionIndex].items.findIndex(i => i.id === newItem.item_id);
                    
                    if (itemIndex !== -1) {
                  // Create a key to check if this field is being edited
                  const fieldKey = `${sectionIndex}-${itemIndex}`;
                  
                  // Only update if the field is not being actively edited by the user
                  if (!editingFields.has(fieldKey)) {
                      // Update the item with the new values
                      newSections[sectionIndex].items[itemIndex] = {
                        ...newSections[sectionIndex].items[itemIndex],
                        checked: newItem.checked || false,
                        assignedTo: newItem.assigned_to === null ? undefined : newItem.assigned_to,
                        status: newItem.status === null ? undefined : newItem.status,
                        identifier: newItem.identifier === null ? undefined : newItem.identifier
                      };
                      
                      console.log('Updated item in state:', newSections[sectionIndex].items[itemIndex]);
                  } else {
                    console.log('Skipping update for field being edited by user:', fieldKey);
                  }
                    }
                  }
                  
                  return newSections;
                });
              } else {
                // For other event types or if we don't have the payload data, fetch all data
                console.log('Fetching all equipment data due to change event');
                fetchEquipmentData();
            }
          })
          .on('system', { event: '*' }, (payload: { event: string; [key: string]: any }) => {
            console.log('System event:', payload);
          });

        // Subscribe with error handling
      const status = await channel.subscribe(async (status: string, err: any) => {
          console.log(`Subscription status: ${status}`, err || '');
          
          if (status === 'SUBSCRIBED') {
            console.log('Successfully subscribed to equipment checklist changes');
            await fetchEquipmentData();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.error(`Channel ${status}:`, err);
          }
        });

        console.log('Channel setup completed:', status);
      return channel;
      } catch (error) {
        console.error('Error setting up subscription:', error);
      return null;
    }
  }, [fetchEquipmentData]);

  useEffect(() => {
    let channelInstance: ReturnType<typeof supabase.channel> | null = null;

    async function initSubscription() {
      try {
        // Clean up any existing channel before creating a new one
        if (channelInstance) {
          await supabase.removeChannel(channelInstance).catch(err => {
            console.error('Error removing existing channel:', err);
          });
          channelInstance = null;
        }
        
        // Create a new channel
        channelInstance = await setupRealtimeSubscription(supabase, activeEditingFields);
      } catch (error) {
        console.error('Error initializing subscription:', error);
      }
    }

    // Initial setup
    initSubscription();

    // Cleanup
    return () => {
      if (channelInstance) {
        console.log('Cleaning up subscription...');
        // Use a try-catch to prevent errors during cleanup
        try {
          // We need to use a synchronous approach here to ensure cleanup happens
          // before the component is fully unmounted
          supabase.removeChannel(channelInstance).catch(err => {
            console.error('Error removing channel during cleanup:', err);
          });
        } catch (error) {
          console.error('Error in cleanup function:', error);
        }
      }
    };
  }, [supabase, activeEditingFields, setupRealtimeSubscription]);

  // Save changes to Supabase
  const saveItemToDatabase = async (sectionTitle: string, item: ChecklistItem) => {
    try {
      setIsSaving(true);
      setSaveError(null);
      
      // Create a data object with explicit null values for cleared fields
      const dataToSave = {
        section: sectionTitle,
        item_id: item.id,
        name: item.name,
        checked: item.checked,
        assigned_to: item.assignedTo || null,
        status: item.status || null,
        identifier: item.identifier || null,
        updated_at: new Date().toISOString()
      };
      
      // Only log for debugging if needed
      // console.log('Saving item to database:', dataToSave);
      
      const { error } = await supabase
        .from('equipment_checklist')
        .upsert(dataToSave, {
          onConflict: 'section,item_id'
        });
      
      if (error) {
        console.error('Error saving equipment checklist item:', error);
        setSaveError(`Failed to save: ${error.message}`);
      } else {
        // Reduce console logging
        // console.log('Equipment checklist item saved successfully:', data);
      }
    } catch (error) {
      console.error('Error in saveItemToDatabase:', error);
      setSaveError('An unexpected error occurred while saving');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCheckChange = (sectionIndex: number, itemIndex: number, checked: boolean) => {
    console.log(`Checkbox changed: section ${sectionIndex}, item ${itemIndex}, checked: ${checked}`);
    const newSections = [...sections];
    newSections[sectionIndex].items[itemIndex].checked = checked;
    setSections(newSections);
    
    // Save to database
    saveItemToDatabase(
      newSections[sectionIndex].title,
      newSections[sectionIndex].items[itemIndex]
    );
  };

  const handleCheckerChange = (sectionIndex: number, itemIndex: number, checker: string) => {
    const newSections = [...sections];
    const key = `${sectionIndex}-${itemIndex}`;
    
    // Update the assigned checker
    newSections[sectionIndex].items[itemIndex].assignedTo = checker;
    
    // Automatically set checked to true when a checker is assigned
    if (checker) {
      newSections[sectionIndex].items[itemIndex].checked = true;
      
      // For vehicle sections, also set a default fuel level if not already set
      if (isVehicleSection(newSections[sectionIndex].title)) {
        // Set default fuel level to "Pending" if not already set
        if (!newSections[sectionIndex].items[itemIndex].status) {
          newSections[sectionIndex].items[itemIndex].status = "Pending";
        }
        
        // Highlight the identifier field to indicate it needs to be filled
        if (!newSections[sectionIndex].items[itemIndex].identifier) {
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
      setHighlightedCheckbox({ sectionIndex, itemIndex });
      setTimeout(() => {
        setHighlightedCheckbox(null);
      }, 1500); // Remove highlight after 1.5 seconds
    }
    
    setSections(newSections);
    
    // Save to database
    saveItemToDatabase(
      newSections[sectionIndex].title,
      newSections[sectionIndex].items[itemIndex]
    );
  };

  const handleStatusChange = (sectionIndex: number, itemIndex: number, status: string) => {
    const newSections = [...sections];
    newSections[sectionIndex].items[itemIndex].status = status;
    setSections(newSections);
    
    // Save to database
    saveItemToDatabase(
      newSections[sectionIndex].title,
      newSections[sectionIndex].items[itemIndex]
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
      // Update the main state
    const newSections = [...sections];
    newSections[sectionIndex].items[itemIndex].identifier = identifier;
    setSections(newSections);
    
      // Save to database
      saveItemToDatabase(
        newSections[sectionIndex].title,
        newSections[sectionIndex].items[itemIndex]
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
  const handleIdentifierBlur = useCallback((sectionIndex: number, itemIndex: number) => {
    const key = `${sectionIndex}-${itemIndex}`;
    const identifier = localIdentifiers[key] || '';
    
    // If there's a pending save, clear it
    if (pendingSaves[key]) {
      clearTimeout(pendingSaves[key]);
      
      // Remove from pending saves
      setPendingSaves(prev => {
        const newPendingSaves = { ...prev };
        delete newPendingSaves[key];
        return newPendingSaves;
      });
    }
    
    // Update the main state immediately
    const newSections = [...sections];
    newSections[sectionIndex].items[itemIndex].identifier = identifier;
    setSections(newSections);
    
    // Save to database immediately
      saveItemToDatabase(
        newSections[sectionIndex].title,
        newSections[sectionIndex].items[itemIndex]
      );
      
    // Mark this field as no longer being edited
    setActiveEditingFields(prev => {
      const newSet = new Set(prev);
      newSet.delete(key);
      return newSet;
    });
  }, [sections, localIdentifiers, pendingSaves]);

  // Add CSS transition to input field
  const inputStyle = "transition: border-color 0.3s ease-in-out;";

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
    console.log(`Clearing item: section ${sectionIndex}, item ${itemIndex}`);
    
    const newSections = [...sections];
    const item = newSections[sectionIndex].items[itemIndex];
    const key = `${sectionIndex}-${itemIndex}`;
    
    // Update the item with cleared values
    newSections[sectionIndex].items[itemIndex] = {
      ...item,
      checked: false,
      assignedTo: undefined,
      status: undefined,
      identifier: undefined
    };
    
    setSections(newSections);
    
    // Clear local identifier state
    setLocalIdentifiers(prev => {
      const newState = { ...prev };
      delete newState[key];
      return newState;
    });
    
    // Clear any pending save for this item
    if (pendingSaves[key]) {
      clearTimeout(pendingSaves[key]);
      setPendingSaves(prev => {
        const newPendingSaves = { ...prev };
        delete newPendingSaves[key];
        return newPendingSaves;
      });
    }
    
    // Remove from active editing fields
    setActiveEditingFields(prev => {
      const newSet = new Set(prev);
      newSet.delete(key);
      return newSet;
    });
    
    // Clear any typing indicator if it's currently showing for this item
    if (isTyping && 
        isTyping.sectionIndex === sectionIndex && 
        isTyping.itemIndex === itemIndex) {
      setIsTyping(null);
    }
    
    // Save to database with explicit null values
    saveItemToDatabase(
      newSections[sectionIndex].title,
      newSections[sectionIndex].items[itemIndex]
    );
  };

  const isVehicleSection = (title: string) => {
    return title === "VEHICLE FPT" || title === "VEHICLE LPT";
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

  return (
    <div className="container mx-auto py-3 sm:py-6 px-3 sm:px-6">
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
          <div className="flex flex-row items-center gap-2 sm:gap-3">
            <Link href="https://fire-check-app.vercel.app/ppe-check" className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 sm:h-10 px-2 sm:px-4 py-0">
              <ArrowLeft className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Back to PPE Check</span>
            </Link>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Equipment Checklist</h1>
          </div>
          
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
                              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Checker</th>
                              <th className="w-[100px] px-4 py-3 text-center text-sm font-medium text-muted-foreground">Clear</th>
                            </>
                          ) : isVehicleSection(section.title) ? (
                            <>
                              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Checker</th>
                              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Fuel Level</th>
                              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Response ID</th>
                              <th className="w-[100px] px-4 py-3 text-center text-sm font-medium text-muted-foreground">Clear</th>
                            </>
                          ) : (
                            <>
                              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Assigned To</th>
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
                            <td className="px-4 py-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">{item.name}</td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex justify-center items-center">
                                <div className="relative flex items-center justify-center">
                                  <Checkbox 
                                    id={`${section.title}-${item.id}-desktop`}
                                    checked={item.checked}
                                    onCheckedChange={(checked) => 
                                      handleCheckChange(sectionIndex, itemIndex, checked as boolean)
                                    }
                                    className={cn(
                                      "h-5 w-5 cursor-pointer data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground transition-colors duration-150",
                                      highlightedCheckbox && 
                                      highlightedCheckbox.sectionIndex === sectionIndex && 
                                      highlightedCheckbox.itemIndex === itemIndex ? 
                                      "ring-2 ring-primary ring-offset-2 transition-all duration-150" : ""
                                    )}
                                    aria-label={`Mark ${item.name} as checked`}
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
                                    value={item.assignedTo || ""}
                                    onValueChange={(value) => handleCheckerChange(sectionIndex, itemIndex, value)}
                                  >
                                    <SelectTrigger className="w-full">
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
                                        <SelectItem key={level} value={level}>
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
                                      onBlur={() => handleIdentifierBlur(sectionIndex, itemIndex)}
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
                                            <SelectItem key={checker} value={checker}>
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
                  {section.title === "ARMOURY" ? (
                    <div className="border-t border-gray-200 dark:border-gray-800">
                      {/* Header row with smaller text and better spacing */}
                      <div className="grid grid-cols-12 px-3 py-1.5 bg-gray-50 dark:bg-neutral-800/50 text-[10px] font-medium text-muted-foreground">
                        <div className="col-span-4 truncate pr-1">Appliance</div>
                        <div className="col-span-2 text-center truncate">Status</div>
                        <div className="col-span-5 truncate pr-1">Checker</div>
                        <div className="col-span-1 text-center truncate">Clear</div>
                      </div>
                      {section.items.map((item, itemIndex) => (
                        <div 
                          key={item.id}
                          className={cn(
                            "grid grid-cols-12 items-center px-3 py-2 border-b border-gray-200 dark:border-gray-800",
                            item.checked ? "bg-muted/20 dark:bg-muted/10" : ""
                          )}
                        >
                          {/* Appliance name with truncation */}
                          <div className="col-span-4 text-xs font-medium text-neutral-700 dark:text-neutral-300 pr-1 truncate">
                            {item.name}
                          </div>
                          {/* Status checkbox with better tap target */}
                          <div className="col-span-2 flex justify-center">
                            <div className="relative flex items-center justify-center w-full h-full">
                              <Checkbox 
                                id={`${section.title}-${item.id}-mobile`}
                                checked={item.checked}
                                onCheckedChange={(checked) => 
                                  handleCheckChange(sectionIndex, itemIndex, checked as boolean)
                                }
                                className={cn(
                                  "h-5 w-5 cursor-pointer data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground transition-colors duration-150",
                                  highlightedCheckbox && 
                                  highlightedCheckbox.sectionIndex === sectionIndex && 
                                  highlightedCheckbox.itemIndex === itemIndex ? 
                                  "ring-2 ring-primary ring-offset-2 transition-all duration-150" : ""
                                )}
                                aria-label={`Mark ${item.name} as checked`}
                              />
                              {item.required && !item.checked && (
                                <span className="ml-1 text-red-500 animate-pulse-medium">*</span>
                              )}
                            </div>
                          </div>
                          {/* Checker dropdown with compact styling */}
                          <div className="col-span-5 pr-1">
                            <Select
                              value={item.assignedTo || ""}
                              onValueChange={(value) => handleCheckerChange(sectionIndex, itemIndex, value)}
                            >
                              <SelectTrigger className="w-full h-7 text-xs min-h-0 py-0 px-2 transition-all duration-150">
                                <SelectValue placeholder="Select checker" className="truncate" />
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
                                    <div className="px-2 py-1 text-xs font-medium text-muted-foreground">{group}</div>
                                    {members && members.length > 0 ? members.map((checker) => (
                                      <SelectItem key={checker} value={checker} className="text-xs py-1">
                                        {checker}
                                      </SelectItem>
                                    )) : (
                                      <div className="px-2 py-1 text-xs text-muted-foreground/70">No personnel available</div>
                                    )}
                                  </React.Fragment>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {/* Clear button with better tap target */}
                          <div className="col-span-1 flex justify-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleClearItem(sectionIndex, itemIndex)}
                              className="h-6 w-6 p-0 transition-colors duration-150"
                              aria-label={`Clear ${item.name}`}
                            >
                              <X className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : isVehicleSection(section.title) ? (
                    <div className="border-t border-gray-200 dark:border-gray-800">
                      <div className="grid grid-cols-12 px-3 py-1.5 bg-gray-50 dark:bg-neutral-800/50 text-[10px] font-medium text-muted-foreground">
                        <div className="col-span-10 truncate pr-1">Vehicle</div>
                        <div className="col-span-1 text-center truncate">Status</div>
                        <div className="col-span-1 text-center truncate">Clear</div>
                      </div>
                      {section.items.map((item, itemIndex) => (
                        <div 
                          key={item.id}
                          className={cn(
                            "border-b border-gray-200 dark:border-gray-800",
                            item.checked ? "bg-muted/20 dark:bg-muted/10" : ""
                          )}
                        >
                          {/* First row: Vehicle name, Status checkbox, Clear button */}
                          <div className="grid grid-cols-12 items-center px-3 py-2">
                            {/* Vehicle name with more space */}
                            <div className="col-span-10 text-xs font-medium text-neutral-700 dark:text-neutral-300 pr-1">
                              {item.name}
                            </div>
                            {/* Status checkbox */}
                            <div className="col-span-1 flex justify-center">
                              <div className="relative flex items-center justify-center w-full h-full">
                                <Checkbox 
                                  id={`${section.title}-${item.id}-mobile`}
                                  checked={item.checked}
                                  onCheckedChange={(checked) => 
                                    handleCheckChange(sectionIndex, itemIndex, checked as boolean)
                                  }
                                  className={cn(
                                    "h-5 w-5 cursor-pointer data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground transition-colors duration-150",
                                    highlightedCheckbox && 
                                    highlightedCheckbox.sectionIndex === sectionIndex && 
                                    highlightedCheckbox.itemIndex === itemIndex ? 
                                    "ring-2 ring-primary ring-offset-2 transition-all duration-150" : ""
                                  )}
                                  aria-label={`Mark ${item.name} as checked`}
                                />
                                {item.required && !item.checked && (
                                  <span className="ml-1 text-red-500 animate-pulse-medium">*</span>
                                )}
                              </div>
                            </div>
                            {/* Clear button */}
                            <div className="col-span-1 flex justify-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleClearItem(sectionIndex, itemIndex)}
                                className="h-6 w-6 p-0 transition-colors duration-150"
                                aria-label={`Clear ${item.name}`}
                              >
                                <X className="h-3.5 w-3.5 text-red-500" />
                              </Button>
                            </div>
                          </div>
                          
                          {/* Second row: Checker, Fuel, ID */}
                          <div className="grid grid-cols-12 gap-2 px-3 pb-3">
                            {/* Checker dropdown */}
                            <div className="col-span-4">
                              <div className="text-[10px] text-muted-foreground mb-1 font-medium">Checker:</div>
                              <Select
                                value={item.assignedTo || ""}
                                onValueChange={(value) => handleCheckerChange(sectionIndex, itemIndex, value)}
                              >
                                <SelectTrigger className="w-full h-7 text-xs min-h-0 py-0 px-2 transition-all duration-150">
                                  <SelectValue placeholder="Select" className="truncate" />
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
                            
                            {/* Fuel level dropdown */}
                            <div className="col-span-4">
                              <div className="text-[10px] text-muted-foreground mb-1 font-medium">
                                Fuel:
                                {item.assignedTo && (item.status === "Pending" || !item.status) && (
                                  <span className="ml-1 text-red-500 animate-pulse-medium">*</span>
                                )}
                              </div>
                              <Select
                                value={item.status || ""}
                                onValueChange={(value) => handleStatusChange(sectionIndex, itemIndex, value)}
                              >
                                <SelectTrigger className={cn(
                                  "w-full h-7 text-xs min-h-0 py-0 px-2 transition-all duration-150 border",
                                  "focus:border-amber-300 focus:ring-amber-500",
                                  item.assignedTo && (item.status === "Pending" || !item.status)
                                    ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20 animate-pulse-medium" 
                                    : ""
                                )}>
                                  <SelectValue placeholder="Fuel" className="truncate" />
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
                            
                            {/* Response ID input */}
                            <div className="col-span-4">
                              <div className="text-[10px] text-muted-foreground mb-1 font-medium">
                                ID:
                                {item.assignedTo && !item.identifier && !localIdentifiers[`${sectionIndex}-${itemIndex}`] && (
                                  <span className="ml-1 text-red-500 animate-pulse-medium">*</span>
                                )}
                              </div>
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
                                onBlur={() => handleIdentifierBlur(sectionIndex, itemIndex)}
                                placeholder="Response ID"
                                className={cn(
                                  "w-full transition-all duration-150 border text-xs h-7 min-h-[28px] px-3",
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
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : section.title === "BWC" ? (
                    <div className="border-t border-gray-200 dark:border-gray-800">
                      <div className="grid grid-cols-12 px-3 py-1.5 bg-gray-50 dark:bg-neutral-800/50 text-[10px] font-medium text-muted-foreground">
                        <div className="col-span-4 truncate pr-1">Serial Number</div>
                        <div className="col-span-2 text-center truncate">Status</div>
                        <div className="col-span-5 truncate pr-1">Assigned To</div>
                        <div className="col-span-1 text-center truncate">Clear</div>
                      </div>
                      {section.items.map((item, itemIndex) => (
                        <div 
                          key={item.id}
                          className={cn(
                            "grid grid-cols-12 items-center px-3 py-2 border-b border-gray-200 dark:border-gray-800",
                            item.checked ? "bg-muted/20 dark:bg-muted/10" : ""
                          )}
                        >
                          {/* Serial Number with truncation */}
                          <div className="col-span-4 text-xs font-medium text-neutral-700 dark:text-neutral-300 pr-1 truncate">
                            {item.name}
                          </div>
                          {/* Status checkbox with better tap target */}
                          <div className="col-span-2 flex justify-center">
                            <div className="relative flex items-center justify-center w-full h-full">
                              <Checkbox 
                                id={`${section.title}-${item.id}-mobile`}
                                checked={item.checked}
                                onCheckedChange={(checked) => 
                                  handleCheckChange(sectionIndex, itemIndex, checked as boolean)
                                }
                                className={cn(
                                  "h-5 w-5 cursor-pointer data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground transition-colors duration-150",
                                  highlightedCheckbox && 
                                  highlightedCheckbox.sectionIndex === sectionIndex && 
                                  highlightedCheckbox.itemIndex === itemIndex ? 
                                  "ring-2 ring-primary ring-offset-2 transition-all duration-150" : ""
                                )}
                                aria-label={`Mark ${item.name} as checked`}
                              />
                              {item.required && !item.checked && (
                                <span className="ml-1 text-red-500 animate-pulse-medium">*</span>
                              )}
                            </div>
                          </div>
                          {/* Assigned To dropdown with compact styling */}
                          <div className="col-span-5 pr-1">
                            <Select
                              value={item.assignedTo || ""}
                              onValueChange={(value) => handleCheckerChange(sectionIndex, itemIndex, value)}
                            >
                              <SelectTrigger className="w-full h-7 text-xs min-h-0 py-0 px-2 transition-all duration-150">
                                <SelectValue placeholder="Select person" className="truncate" />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(personnelGroups)
                                  .filter(([group]) => group !== "NS MARINE FIREFIGHTER")
                                  .map(([group, members]) => (
                                  <React.Fragment key={group}>
                                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{group}</div>
                                    {members && members.length > 0 ? members.map((checker) => (
                                      <SelectItem key={checker} value={checker}>
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
                          {/* Clear button with better tap target */}
                          <div className="col-span-1 flex justify-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleClearItem(sectionIndex, itemIndex)}
                              className="h-6 w-6 p-0 transition-colors duration-150"
                              aria-label={`Clear ${item.name}`}
                            >
                              <X className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-2 space-y-4">
                  {section.items.map((item, itemIndex) => (
                    <div 
                      key={item.id}
                      className={cn(
                        "p-4 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-neutral-900 shadow-sm transition-all duration-200",
                            item.checked ? "bg-muted/40 dark:bg-muted/30 border-primary/20 transition-colors duration-150" : ""
                      )}
                    >
                      <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                              {item.name}
                            </span>
                        <div className="flex items-center gap-3">
                          <div className="relative flex items-center justify-center">
                            <Checkbox 
                              id={`${section.title}-${item.id}-mobile`}
                              checked={item.checked}
                              onCheckedChange={(checked) => 
                                handleCheckChange(sectionIndex, itemIndex, checked as boolean)
                              }
                              className={cn(
                                    "h-5 w-5 cursor-pointer data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground transition-colors duration-150",
                                highlightedCheckbox && 
                                highlightedCheckbox.sectionIndex === sectionIndex && 
                                highlightedCheckbox.itemIndex === itemIndex ? 
                                    "ring-2 ring-primary ring-offset-2 transition-all duration-150" : ""
                              )}
                              aria-label={`Mark ${item.name} as checked`}
                            />
                          </div>
                          {(section.title === "ARMOURY" || isVehicleSection(section.title) || section.title === "BWC") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleClearItem(sectionIndex, itemIndex)}
                                  className="h-6 w-6 p-0 transition-colors duration-150"
                                  aria-label={`Clear ${item.name}`}
                            >
                                  <X className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      {section.title === "ARMOURY" ? (
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800 space-y-4">
                          <div>
                            <div className="mb-2 text-xs text-muted-foreground">Assigned To:</div>
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
                          </div>
                        </div>
                      ) : isVehicleSection(section.title) ? (
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800 space-y-4">
                          <div>
                            <div className="mb-2 text-xs text-muted-foreground">Assigned To:</div>
                            <Select
                              value={item.assignedTo || ""}
                              onValueChange={(value) => handleCheckerChange(sectionIndex, itemIndex, value)}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select checker" />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(personnelGroups)
                                  .filter(([group]) => group === "REGULARS")
                                  .map(([group, members]) => (
                                  <React.Fragment key={group}>
                                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{group}</div>
                                    {members && members.length > 0 ? members.map((checker) => (
                                      <SelectItem key={checker} value={checker}>
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
                                <div className="flex items-center justify-between mb-2">
                                  <div className="text-xs text-muted-foreground">Fuel Level:</div>
                                  {item.assignedTo && (item.status === "Pending" || !item.status) ? (
                                    <div className="text-xs text-red-600 dark:text-red-400 font-medium flex items-center">
                                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 mr-1.5 animate-pulse-medium"></span>
                                      Required
                                </div>
                                  ) : (
                                    <div className="text-xs opacity-0">Required</div>
                              )}
                            </div>
                            <Select
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
                                  <SelectItem key={level} value={level}>
                                    {level}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                              
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <div className="text-xs text-muted-foreground">Response ID:</div>
                                  {item.assignedTo && !item.identifier && !localIdentifiers[`${sectionIndex}-${itemIndex}`] ? (
                                    <div className="text-xs text-red-600 dark:text-red-400 font-medium flex items-center">
                                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 mr-1.5 animate-pulse-medium"></span>
                                      Required
                                    </div>
                                  ) : (
                                    <div className="text-xs opacity-0">Required</div>
                                  )}
                                </div>
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
                                  onBlur={() => handleIdentifierBlur(sectionIndex, itemIndex)}
                                  placeholder="Response ID"
                                  className={cn(
                                    "w-full transition-all duration-150 border text-xs h-7 min-h-[28px] px-3",
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
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800 space-y-4">
                          <div>
                            <div className="mb-2 text-xs text-muted-foreground">Assigned To:</div>
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
                                      <SelectItem key={checker} value={checker}>
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
                        </div>
                      )}
                    </div>
                  ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="flex justify-end mt-4 sm:mt-6">
          <Button
            variant="destructive"
            size="default"
            onClick={() => setIsResetDialogOpen(true)}
            className="flex items-center gap-1.5 sm:gap-2 h-9 sm:h-10 text-sm"
            disabled={isSaving || isLoading}
          >
            <Trash2 className="h-4 w-4" />
            Reset All Equipment
          </Button>
        </div>

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
      </div>
    </div>
  );
} 
