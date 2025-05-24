import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Telegram Bot Token
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const ALLOWED_GROUP_ID = process.env.TELEGRAM_GROUP_ID!;

interface TelegramUpdate {
  message?: {
    chat: {
      id: number;
      type: string;
    };
    text: string;
    from?: {
      id: number;
      first_name: string;
      last_name?: string;
    };
  };
}

// Define types for vehicle mapping
type VehicleInfo = {
  id: number;
  name: string;
  section: string;
};

// Cache for vehicle mappings
let vehicleMappingsCache: VehicleInfo[] = [];
let lastCacheUpdate: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Function to fetch vehicle mappings from database
async function getVehicleMappings(): Promise<VehicleInfo[]> {
  const now = Date.now();
  
  // Return cached mappings if they exist and are not expired
  if (vehicleMappingsCache.length > 0 && (now - lastCacheUpdate) < CACHE_DURATION) {
    return vehicleMappingsCache;
  }

  try {
    const { data, error } = await supabase
      .from('equipment_checklist')
      .select('item_id, name, section')
      .in('section', ['VEHICLE FPT', 'VEHICLE LPT']);

    if (error) {
      console.error('Error fetching vehicle mappings:', error);
      return [];
    }

    // Map database fields to VehicleInfo type
    const mappings: VehicleInfo[] = (data || []).map(item => ({
      id: item.item_id,
      name: item.name,
      section: item.section
    }));

    // Update cache
    vehicleMappingsCache = mappings;
    lastCacheUpdate = now;
    
    return mappings;
  } catch (error) {
    console.error('Error in getVehicleMappings:', error);
    return [];
  }
}

// Add new type for parsed message
interface ParsedMessage {
  vehicleType: string;
  section: 'FPT' | 'LPT';
  plateNumber: string;
  checker?: string | null;
}

// Parse message text to extract vehicle type, plate number, and checker (if present)
async function parseMessage(text: string): Promise<ParsedMessage | null> {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  if (lines.length < 4) return null;

  // Determine if it's FPT or LPT
  const isFPT = text.toUpperCase().includes('FIRST PARADE TASK');
  const isLPT = text.toUpperCase().includes('LAST PARADE TASK');
  if (!isFPT && !isLPT) return null;
  const section = isFPT ? 'FPT' : 'LPT';

  // Extract vehicle type and plate number
  const vehicleTypeLine = lines[2];
  const plateNumberLine = lines[3];
  if (!vehicleTypeLine || !plateNumberLine) return null;
  let vehicleType = vehicleTypeLine.replace(/\(.*\)/, '').replace(/First Parade Task|Last Parade Task/i, '').trim();
  let plateNumber = plateNumberLine.trim().toUpperCase();
  vehicleType = vehicleType.replace(/\s+/g, ' ').trim();

  // Look for a checker line (e.g., 'Checker: John Tan')
  let checker: string | null = null;
  for (const line of lines) {
    const match = line.match(/^checker:\s*(.+)$/i);
    if (match) {
      checker = match[1].trim();
      break;
    }
  }

  return {
    vehicleType,
    section,
    plateNumber,
    checker
  };
}

// Update database with vehicle status, using checker if present
async function updateVehicleStatus(
  section: 'FPT' | 'LPT',
  vehicleType: string,
  plateNumber: string,
  checker: string | null
) {
  try {
    const vehicleMappings = await getVehicleMappings();
    const vehicleInfo = vehicleMappings.find(mapping => {
      if (mapping.section !== `VEHICLE ${section}`) return false;
      const match = mapping.name.match(/^(.*)\(([^)]+)\)$/);
      if (!match) return false;
      const dbType = match[1].trim();
      const dbPlate = match[2].trim().toUpperCase();
      return (
        dbType.toUpperCase() === vehicleType.toUpperCase() &&
        dbPlate === plateNumber
      );
    });
    if (!vehicleInfo) return false;
    const { error } = await supabase
      .from('equipment_checklist')
      .upsert({
        section: `VEHICLE ${section}`,
        item_id: vehicleInfo.id,
        name: vehicleInfo.name,
        checked: true,
        assigned_to: checker || null,
        last_updated: new Date().toISOString()
      }, {
        onConflict: 'section,item_id'
      });
    return !error;
  } catch (error) {
    console.error('Error in updateVehicleStatus:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Log the raw request body
    const raw = await request.text();
    console.log('RAW BODY:', raw);

    // Parse JSON
    let update: TelegramUpdate;
    try {
      update = JSON.parse(raw);
      console.log('PARSED JSON:', update);
    } catch (jsonErr) {
      const errMsg = jsonErr instanceof Error ? jsonErr.message : String(jsonErr);
      console.error('JSON PARSE ERROR:', errMsg);
      return NextResponse.json({ status: 'invalid json', error: errMsg }, { status: 400 });
    }

    // Validate the message
    if (!update.message || 
        !['group', 'supergroup'].includes(update.message.chat.type) || 
        update.message.chat.id.toString() !== ALLOWED_GROUP_ID) {
      console.warn('Unauthorized or invalid chat:', update.message?.chat);
      return NextResponse.json({ status: 'unauthorized' }, { status: 401 });
    }
    const messageText = update.message.text;
    // Parse the message
    const parsedInfo = await parseMessage(messageText);
    console.log('PARSED MESSAGE:', parsedInfo);
    if (!parsedInfo) {
      console.warn('Invalid message format:', messageText);
      // Always return 200 OK so Telegram will deliver the next update
      return NextResponse.json({ status: 'ignored' }, { status: 200 });
    }
    // Update the database
    const success = await updateVehicleStatus(
      parsedInfo.section,
      parsedInfo.vehicleType,
      parsedInfo.plateNumber,
      parsedInfo.checker || null
    );
    if (!success) {
      console.error('Database update failed for:', parsedInfo);
      return NextResponse.json({ status: 'database update failed' }, { status: 500 });
    }
    console.log('Database update success for:', parsedInfo);
    return NextResponse.json({ status: 'success' });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Error processing Telegram webhook:', errMsg);
    return NextResponse.json({ status: 'error', error: errMsg }, { status: 500 });
  }
}

// Handle Telegram webhook verification
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const token = searchParams.get('token');

  if (token !== TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ status: 'unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ status: 'ok' });
} 