import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

interface InventoryItem {
  name: string;
  category: string;
  quantity: number;
  lastUpdated: string;
}

interface ChecklistItem {
  section: string;
  item_id: number;
  name: string;
  checked: boolean;
  status: string | null;
  identifier: string | null;
  assigned_to: string | null;
}

interface MappedItem {
  id: number;
  name: string;
}

interface ScrapedItem {
  title: string;
  status: string;
  dueDate: string;
}

interface SessionCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

interface SessionData {
  cookies: SessionCookie[];
  origins?: Array<{
    localStorage?: Array<{ name: string; value: string }>;
    [key: string]: any;
  }>;
  [key: string]: any;
}

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function loadSessionFromDatabase(): Promise<SessionData | null> {
  try {
    // Try to load the latest session state from Supabase
    const { data, error } = await supabase
      .from('browser_sessions')
      .select('session_data')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error || !data || !data.session_data) {
      console.error('Error loading session from database:', error);
      return null;
    }
    
    return data.session_data as SessionData;
  } catch (error) {
    console.error('Error loading session from database:', error);
    return null;
  }
}

async function processAndUpdateChecklist(items: ScrapedItem[]) {
  console.log('Processing and updating checklist items...');
  
  // Define the mapping of items
  const itemMapping: Record<string, MappedItem> = {
    'LF811': { id: 1, name: 'LF811' },
    'LF812': { id: 2, name: 'LF812' },
    'RFV811': { id: 3, name: 'RFV811' },
    'MRV811': { id: 4, name: 'MRV811' },
    'MRV811 - EMT BAG 1': { id: 5, name: 'MRV811 EMT Bag 1' },
    'MRV811 - EMT BAG 2': { id: 6, name: 'MRV811 EMT Bag 2' }
  };

  for (const item of items) {
    try {
      // Get the full title for matching
      const fullTitle = item.title.split(' - ')[0].toUpperCase();
      
      // Special handling for MRV811 EMT bags
      let itemKey = fullTitle;
      if (item.title.toUpperCase().includes('EMT BAG')) {
        itemKey = item.title.split(' - ').slice(0, 2).join(' - ').toUpperCase();
      }
      
      // Find the matching item in our mapping
      const mappedItem = itemMapping[itemKey];
      
      if (!mappedItem) {
        console.log(`Skipping item ${itemKey} - not in mapping`);
        continue;
      }
      
      // Create the checklist item
      const checklistItem: ChecklistItem = {
        section: 'ARMOURY',
        item_id: mappedItem.id,
        name: mappedItem.name,
        checked: item.status === 'Submitted',
        status: item.status || null,
        identifier: null,
        assigned_to: null
      };
      
      // Update or insert the item in Supabase
      const { error } = await supabase
        .from('equipment_checklist')
        .upsert(
          checklistItem,
          { 
            onConflict: 'section,item_id',
            ignoreDuplicates: false 
          }
        );
      
      if (error) {
        console.error(`Error updating item ${checklistItem.name} (ID: ${checklistItem.item_id}):`, error);
      } else {
        console.log(`Successfully updated item ${checklistItem.name} (ID: ${checklistItem.item_id})`);
      }
    } catch (error) {
      console.error('Error processing item:', item, error);
    }
  }
}

async function runScraper() {
  try {
    console.log('Starting HTTP-based scraper...');
    
    // Load session data
    const sessionData = await loadSessionFromDatabase();
    
    if (!sessionData || !sessionData.cookies) {
      throw new Error('No valid session found in database');
    }
    
    // Extract cookies from session data
    const cookies = sessionData.cookies.map((cookie: SessionCookie) => `${cookie.name}=${cookie.value}`).join('; ');
    
    console.log('Session loaded successfully!');
    console.log('Fetching lists page...');
    
    // Fetch the lists page
    const response = await fetch('https://armoury.gov.sg/lists', {
      headers: {
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Sec-GPC': '1',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-User': '?1'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch lists page: ${response.status} ${response.statusText}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    console.log('Page loaded, looking for "View all" link...');
    
    // Get the URL of the "View all" link
    const viewAllHref = $('p.chakra-text:contains("View all")').closest('a').attr('href');
    
    if (!viewAllHref) {
      throw new Error('Could not find "View all" link');
    }
    
    const viewAllUrl = new URL(viewAllHref, 'https://armoury.gov.sg').href;
    console.log(`Found "View all" link: ${viewAllUrl}`);
    
    // Fetch the "View all" page
    const viewAllResponse = await fetch(viewAllUrl, {
      headers: {
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Sec-GPC': '1',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-User': '?1'
      }
    });
    
    if (!viewAllResponse.ok) {
      throw new Error(`Failed to fetch view all page: ${viewAllResponse.status} ${viewAllResponse.statusText}`);
    }
    
    const viewAllHtml = await viewAllResponse.text();
    const $viewAll = cheerio.load(viewAllHtml);
    
    console.log('Reading items...');
    const processedItems: ScrapedItem[] = [];
    
    // Parse the items from the page
    $viewAll('.css-8krjsn').each((index, element) => {
      try {
        const title = $viewAll(element).find('p.chakra-text.css-qlwhay').text().trim();
        
        // Get the details div that follows this item
        const detailsDiv = $viewAll(element).next();
        
        // Try different selectors for status
        const statusSelectors = [
          '.css-1jcdzpd p.chakra-text',
          '.css-o5vkw1 p.chakra-text',
          '.css-181ukw4 p.chakra-text'
        ];
        
        let status = 'Unknown';
        for (const selector of statusSelectors) {
          const statusElement = detailsDiv.find(selector);
          if (statusElement.length > 0) {
            status = statusElement.text().trim();
            break;
          }
        }
        
        // Get due date
        const dueDate = detailsDiv.find('p.chakra-text.css-jjn383').text().trim() || 'No due date';
        
        processedItems.push({ title, status, dueDate });
      } catch (error) {
        console.error('Error reading item:', error);
      }
    });
    
    console.log(`Processed ${processedItems.length} items`);
    
    console.log('Updating Supabase database...');
    await processAndUpdateChecklist(processedItems);
    console.log('Database update completed');
    
    console.log('Scraper completed successfully');
    return { success: true, message: 'Scraping completed', items: processedItems.length };
  } catch (error) {
    console.error('Scraper error:', error instanceof Error ? error.message : 'Unknown error');
    console.error(error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Optional: Add authentication/authorization checks here
    
    // Run the scraper
    const result = await runScraper();
    
    // Return a successful response
    return NextResponse.json(
      { success: true, message: 'Scraper ran successfully', details: result },
      { status: 200 }
    );
  } catch (error) {
    console.error('API route error:', error);
    // Return an error response
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to run scraper', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

// Also support GET requests for easier testing
export async function GET() {
  return NextResponse.json(
    { message: 'Use POST to trigger the scraper' },
    { status: 200 }
  );
} 