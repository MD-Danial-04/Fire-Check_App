import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright-core';
import chromium_path from '@sparticuz/chromium';

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
  // Define the mapping of items
  const itemMapping: Record<string, MappedItem> = {
    'LF811': { id: 1, name: 'LF811' },
    'LF812': { id: 2, name: 'LF812' },
    'RFV811': { id: 3, name: 'RFV811' },
    'MRV811': { id: 4, name: 'MRV811' },
    'MRV811 - EMT BAG 1': { id: 5, name: 'MRV811 EMT Bag 1' },
    'MRV811 - EMT BAG 2': { id: 6, name: 'MRV811 EMT Bag 2' }
  };

  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

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
        console.log(`Skipping unmapped item: ${itemKey}`);
        skippedCount++;
        continue;
      }

      // Get existing item from database
      const { data: existingItem, error: fetchError } = await supabase
        .from('equipment_checklist')
        .select('*')
        .eq('section', 'ARMOURY')
        .eq('item_id', mappedItem.id)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
        console.error(`Error fetching existing item ${mappedItem.name}:`, fetchError);
        errorCount++;
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

      // Compare with existing item
      const shouldUpdate = !existingItem || 
        existingItem.checked !== checklistItem.checked ||
        existingItem.status !== checklistItem.status;

      // Log comparison details
      console.log(`Comparing item ${checklistItem.name}:`, {
        existing: existingItem ? {
          checked: existingItem.checked,
          status: existingItem.status
        } : 'No existing item',
        new: {
          checked: checklistItem.checked,
          status: checklistItem.status
        },
        shouldUpdate
      });

      if (!shouldUpdate) {
        console.log(`Skipping unchanged item: ${checklistItem.name}`);
        skippedCount++;
        continue;
      }
      
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
        errorCount++;
        console.error(`Error updating item ${checklistItem.name}:`, error.message);
      } else {
        console.log(`Successfully updated item: ${checklistItem.name}`);
        updatedCount++;
      }
    } catch (error) {
      errorCount++;
      console.error('Error processing item:', error);
    }
  }
  
  console.log(`Database update summary: ${updatedCount} updated, ${skippedCount} skipped, ${errorCount} errors`);
  return { updatedCount, skippedCount, errorCount };
}

async function runScraper() {
  // Define browser as null so we can close it properly later
  let browser = null;
  
  try {
    // Validate environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error('Missing required environment variables for Supabase connection');
    }
    
    // Log environment information for debugging
    const isVercel = process.env.VERCEL === '1';
    console.log(`Environment: ${isVercel ? 'Vercel' : 'Local'}`);
    console.log(`Node.js version: ${process.version}`);
    
    if (isVercel) {
      console.log('Vercel environment details:');
      console.log('- VERCEL_ENV:', process.env.VERCEL_ENV);
      console.log('- VERCEL_REGION:', process.env.VERCEL_REGION);
      console.log('- PLAYWRIGHT_BROWSERS_PATH:', process.env.PLAYWRIGHT_BROWSERS_PATH);
      try {
        // Check if @sparticuz/chromium is accessible
        console.log('- @sparticuz/chromium available:', !!chromium_path);
        console.log('- chromium_path properties:', Object.keys(chromium_path));
      } catch (error: any) {
        console.log('- @sparticuz/chromium not accessible:', error.message);
      }
    }
    
    console.log('Starting scraper...');
    
    // Load session data
    const sessionData = await loadSessionFromDatabase();
    
    if (!sessionData || !sessionData.cookies) {
      throw new Error('No valid session found in database');
    }
    
    console.log('Session loaded successfully');
    
    // Configure browser options based on environment
    const options = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    
    if (isVercel) {
      console.log('Using serverless-compatible Chromium settings');
      // Use environment variable to control browser location in Vercel
      process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
      
      try {
        // Get executable path from @sparticuz/chromium
        const executablePath = await chromium_path.executablePath();
        console.log(`Using Chromium executable path: ${executablePath}`);
        
        browser = await chromium.launch({
          args: chromium_path.args,
          executablePath,
          headless: true,
        });
      } catch (error: any) {
        console.error('Error launching browser with @sparticuz/chromium:', error);
        throw new Error(`Failed to launch browser in Vercel environment: ${error.message}`);
      }
    } else {
      browser = await chromium.launch(options);
    }
    
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
    
    // Set cookies from the session data
    for (const cookie of sessionData.cookies) {
      await context.addCookies([{
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain || 'armoury.gov.sg',
        path: cookie.path || '/',
        expires: cookie.expires || -1,
        httpOnly: cookie.httpOnly || false,
        secure: cookie.secure || true,
        sameSite: cookie.sameSite || 'Lax'
      }]);
    }
    
    const page = await context.newPage();
    
    console.log('Navigating to lists page...');
    
    // Set up a response listener for debugging
    let fetchCompleted = false;
    page.on('response', response => {
      if (response.url() === 'https://armoury.gov.sg/lists' && 
          response.request().method() === 'GET' &&
          response.request().headers()['sec-fetch-mode'] === 'navigate') {
        fetchCompleted = true;
      }
    });
    
    try {
      // Navigate to the lists page, using domcontentloaded instead of networkidle
      await page.goto('https://armoury.gov.sg/lists', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      
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
      
      console.log('Page loaded successfully');
    } catch (error: any) {
      console.error('Error navigating to lists page:', error.message);
      console.log('Attempting to continue...');
    }
    
    // Get page title
    const pageTitle = await page.title();
    
    // Check if we're on a login page
    const isLoginPage = await page.content().then(html => 
      html.toLowerCase().includes('login') || 
      html.toLowerCase().includes('sign in')
    );
    
    if (isLoginPage) {
      throw new Error('Session expired or invalid - detected login page');
    }
    
    // Find View all element using the exact selectors from the example
    console.log('Looking for "View all" element...');
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
        // Continue to next selector
      }
    }
    
    if (viewAllElement) {
      console.log('Clicking "View all" element and waiting for content to load...');
      await viewAllElement.click();
      await page.waitForTimeout(1000);
      
      console.log('Reading items...');
      const items = await page.$$('.css-8krjsn');
      console.log(`Found ${items.length} items with class .css-8krjsn`);
      
      const processedItems: ScrapedItem[] = [];
      
      for (let i = 0; i < items.length; i++) {
        try {
          const item = items[i];
          
          // Get the title using the exact selector
          const titleElement = await item.$('p.chakra-text.css-qlwhay');
          const titleText = titleElement ? await titleElement.evaluate((el: Element) => el.textContent || 'No title') : 'No title';
          const title = titleText;
          
          // Get the current item's position to find its details div
          const itemIndex = await page.evaluate((el: any) => {
            const allItems = Array.from(document.querySelectorAll('.css-8krjsn'));
            return allItems.indexOf(el);
          }, item);
          
          // Use the same status selectors from the example
          const statusSelectors = [
            '.css-1jcdzpd p.chakra-text',
            '.css-o5vkw1 p.chakra-text',
            '.css-181ukw4 p.chakra-text'
          ];
          
          let status = 'Unknown';
          for (const selector of statusSelectors) {
            try {
              // Use the itemIndex to find the correct details div
              const statusElement = await page.evaluate(
                (data: any) => {
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
                { selector: selector, index: itemIndex }
              );
              
              if (statusElement) {
                status = statusElement;
                break;
              }
            } catch (error) {
              // Try next selector
            }
          }
          
          // Use the itemIndex for due date as well
          const dueDate = await page.evaluate((idx: number) => {
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
          
          processedItems.push({ 
            title, 
            status: status || 'Unknown', 
            dueDate: dueDate || 'No due date' 
          });
        } catch (error) {
          console.error(`Error processing item ${i}:`, error);
        }
      }
      
      console.log(`Processing ${processedItems.length} items...`);
      
      // Process and update checklist items in the database
      const updateResult = await processAndUpdateChecklist(processedItems);
      console.log('Database update completed');
      
      return {
        items: processedItems,
        updateResult
      };
    } else {
      throw new Error('Could not find "View all" link after trying multiple selectors');
    }
  } catch (error) {
    console.error('Scraper error:', error instanceof Error ? error.message : 'Unknown error');
    
    // Log more detailed error information for Vercel environment
    if (process.env.VERCEL === '1') {
      console.error('Detailed error information:');
      console.error(error);
      
      if (error instanceof Error && error.stack) {
        console.error('Stack trace:', error.stack);
      }
    }
    
    throw error;
  } finally {
    // Always close the browser to prevent resource leaks
    if (browser) {
      console.log('Closing browser...');
      try {
        const contexts = browser.contexts();
        for (const context of contexts) {
          await context.close();
        }
        await browser.close();
      } catch (error) {
        console.error('Error closing browser:', error);
      }
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    // Add request info logging
    const requestId = request.headers.get('x-vercel-id') || 'local-request';
    console.log(`Processing request ${requestId}`);
    
    // Run the scraper
    const result = await runScraper();
    
    // Return a successful response
    return NextResponse.json(
      { 
        success: true, 
        message: 'Scraper ran successfully', 
        requestId,
        details: {
          itemsProcessed: result.items.length,
          updatedItems: result.updateResult.updatedCount,
          skippedItems: result.updateResult.skippedCount,
          errors: result.updateResult.errorCount
        }
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('API route error:', error);
    
    // Return an error response with request ID for tracking
    const requestId = request.headers.get('x-vercel-id') || 'local-request';
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to run scraper', 
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
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