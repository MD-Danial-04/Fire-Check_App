import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import playwright from 'playwright-core';
import chromium from '@sparticuz/chromium';

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

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function loadSessionFromDatabase(context: playwright.BrowserContext) {
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
      return false;
    }
    
    const storageState = data.session_data;
    
    // Add cookies to the context
    if (storageState.cookies && storageState.cookies.length > 0) {
      await context.addCookies(storageState.cookies);
      console.log(`Loaded ${storageState.cookies.length} cookies from database`);
    }
    
    // Add origins to the context
    if (storageState.origins && storageState.origins.length > 0) {
      for (const origin of storageState.origins) {
        if (origin.localStorage && origin.localStorage.length > 0) {
          for (const item of origin.localStorage) {
            await context.addInitScript(`try { 
              window.localStorage.setItem('${item.name}', '${item.value}'); 
            } catch(e) { 
              console.error('Error setting localStorage', e); 
            }`);
          }
        }
      }
      console.log(`Loaded ${storageState.origins.length} origins from database`);
    }
    
    console.log('Session state loaded successfully from database');
    return true;
  } catch (error) {
    console.error('Error loading session from database:', error);
    return false;
  }
}

async function processAndUpdateChecklist(items: any[]) {
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
  let browser: playwright.Browser | null = null;
  try {
    console.log('Starting browser using @sparticuz/chromium...');
    
    // Use sparticuz/chromium to get executable path and launch options
    browser = await playwright.chromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(), 
      headless: true, // Explicitly set to true for serverless
      // Remove specific sandbox args as sparticuz handles common ones
    });
    
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Sec-GPC': '1',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-User': '?1',
        'Priority': 'u=0, i'
      }
    });
    
    const page = await context.newPage();
    console.log('Attempting to load session from database...');
    
    // Try to load session from database
    const sessionLoaded = await loadSessionFromDatabase(context);
    
    if (!sessionLoaded) {
      console.log('Failed to load session from database');
      throw new Error('No valid session found in database');
    }
    
    console.log('Session loaded successfully!');
    console.log('Navigating to lists page...');
    
    let fetchCompleted = false;
    page.on('response', response => {
      if (response.url() === 'https://armoury.gov.sg/lists' && 
          response.request().method() === 'GET' &&
          response.request().headers()['sec-fetch-mode'] === 'navigate') {
        console.log('Detected lists page fetch request');
        fetchCompleted = true;
      }
    });
    
    await page.goto('https://armoury.gov.sg/lists', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    console.log('Waiting for lists page fetch request...');
    await Promise.race([
      new Promise(resolve => {
        const checkFetch = setInterval(() => {
          if (fetchCompleted) {
            clearInterval(checkFetch);
            resolve(true);
          }
        }, 100);
      }),
      page.waitForLoadState('networkidle', { timeout: 30000 })
    ]);
    
    console.log('Page loaded, looking for "View all" element...');
    const buttonSelectors = [
      'p.chakra-text.css-10ahl1q:has-text("View all")',
      'p.chakra-text:has-text("View all")',
      'p:has-text("View all")'
    ];
    
    let viewAllElement = null;
    for (const selector of buttonSelectors) {
      try {
        viewAllElement = await page.waitForSelector(selector, { timeout: 5000 });
        if (viewAllElement) {
          console.log(`Found "View all" element with selector: ${selector}`);
          break;
        }
      } catch (error) {
        console.log(`Element not found with selector: ${selector}`);
      }
    }
    
    if (!viewAllElement) {
      throw new Error('Could not find "View all" element with any selector');
    }
    
    console.log('Clicking "View all" element...');
    await viewAllElement.click();
    console.log('Clicked "View all" element successfully');
    
    await page.waitForTimeout(1000);
    
    console.log('Reading items...');
    const items = await page.$$('.css-8krjsn');
    const processedItems = [];
    
    for (const item of items) {
      try {
        const title = await item.$eval('p.chakra-text.css-qlwhay', el => el.textContent);
        
        const statusSelectors = [
          '.css-1jcdzpd p.chakra-text',
          '.css-o5vkw1 p.chakra-text',
          '.css-181ukw4 p.chakra-text'
        ];
        
        // Get the current item's position to find its details div
        const itemIndex = await page.evaluate((el) => {
          const allItems = Array.from(document.querySelectorAll('.css-8krjsn'));
          return allItems.indexOf(el);
        }, item);
        
        let status = 'Unknown';
        for (const selector of statusSelectors) {
          try {
            // Use the itemIndex to find the correct details div
            const statusElement = await page.evaluate(
              (data) => {
                const { selector, index } = data;
                const items = document.querySelectorAll('.css-8krjsn');
                if (items[index]) {
                  const detailsDivElement = items[index].nextElementSibling;
                  if (detailsDivElement) {
                    const statusEl = detailsDivElement.querySelector(selector);
                    return statusEl ? statusEl.textContent : null;
                  }
                }
                return null;
              }, 
              { selector, index: itemIndex }
            );
            
            if (statusElement) {
              status = statusElement;
              break;
            }
          } catch (error) {
            console.log(`Error checking selector ${selector}:`, error);
          }
        }
        
        // Use the itemIndex for due date as well
        const dueDate = await page.evaluate((idx) => {
          const items = document.querySelectorAll('.css-8krjsn');
          if (items[idx]) {
            const detailsDivElement = items[idx].nextElementSibling;
            if (detailsDivElement) {
              const dueDateEl = detailsDivElement.querySelector('p.chakra-text.css-jjn383');
              return dueDateEl ? dueDateEl.textContent : 'No due date';
            }
          }
          return 'No due date';
        }, itemIndex);
        
        processedItems.push({ title, status, dueDate });
      } catch (error) {
        console.error('Error reading item:', error);
      }
    }
    
    console.log('Updating Supabase database...');
    await processAndUpdateChecklist(processedItems);
    console.log('Database update completed');
    
    // Close the browser before returning
    if (browser) {
      console.log('Closing browser...');
      await browser.close();
      console.log('Browser closed successfully');
    }
    
    console.log('Scraper completed successfully');
    return { success: true, message: 'Scraping completed' };
  } catch (error) {
    // Close the browser if there's an error
    if (browser) {
      try {
        console.log('Closing browser due to error...');
        await browser.close();
        console.log('Browser closed after error');
      } catch (closeError) {
        console.error('Error closing browser:', closeError);
      }
    }
    console.error('Scraper error:', error instanceof Error ? error.message : 'Unknown error');
    // Ensure the full error is logged for debugging
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