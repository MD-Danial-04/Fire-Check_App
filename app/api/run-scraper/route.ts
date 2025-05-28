import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import { chromium, Response, Request } from 'playwright-core';
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

interface StatusValidation {
  isValid: boolean;
  normalizedStatus: string | null;
  error?: string;
}

const VALID_STATUSES = ['In progress', 'Submitted', 'Not started'] as const;
type ValidStatus = typeof VALID_STATUSES[number];

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Add these new interfaces after the existing ones
interface ScraperMetrics {
  startTime: number;
  endTime: number;
  duration: number;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  itemsProcessed: number;
  success: boolean;
  error?: string;
}

// Add this interface for the scraper result
interface ScraperResult {
  items: ScrapedItem[];
  updateResult: {
    updatedCount: number;
    skippedCount: number;
    errorCount: number;
    failedItems: Array<{ item: ScrapedItem; error: string }>;
  };
}

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

function validateStatus(status: string): StatusValidation {
  // Normalize the status text
  const normalizedStatus = status.trim();
  
  // Check if the status is in our valid list
  if (VALID_STATUSES.includes(normalizedStatus as ValidStatus)) {
    return {
      isValid: true,
      normalizedStatus
    };
  }

  // Try to normalize common variations
  const statusMap: Record<string, ValidStatus> = {
    'in progress': 'In progress',
    'submitted': 'Submitted',
    'not started': 'Not started',
    'pending': 'In progress',
    'completed': 'Submitted',
    'overdue': 'Not started'
  };

  const normalized = statusMap[normalizedStatus.toLowerCase()];
  if (normalized) {
    return {
      isValid: true,
      normalizedStatus: normalized
    };
  }

  return {
    isValid: false,
    normalizedStatus: null,
    error: `Invalid status value: "${status}". Expected one of: ${VALID_STATUSES.join(', ')}`
  };
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

  const results = {
    updatedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    failedItems: [] as Array<{ item: ScrapedItem; error: string }>
  };

  for (const item of items) {
    try {
      // Validate the status before processing
      const statusValidation = validateStatus(item.status);
      if (!statusValidation.isValid) {
        console.warn(`Invalid status for item ${item.title}:`, statusValidation.error);
        results.failedItems.push({
          item,
          error: statusValidation.error || 'Invalid status'
        });
        results.errorCount++;
        continue;
      }

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
        results.skippedCount++;
        continue;
      }

      // Get existing item from database
      const { data: existingItem, error: fetchError } = await supabase
        .from('equipment_checklist')
        .select('*')
        .eq('section', 'ARMOURY')
        .eq('item_id', mappedItem.id)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error(`Error fetching existing item ${mappedItem.name}:`, fetchError);
        results.failedItems.push({
          item,
          error: `Database fetch error: ${fetchError.message}`
        });
        results.errorCount++;
        continue;
      }

      // Create the checklist item with validated status
      const checklistItem: ChecklistItem = {
        section: 'ARMOURY',
        item_id: mappedItem.id,
        name: mappedItem.name,
        checked: statusValidation.normalizedStatus === 'Submitted',
        status: statusValidation.normalizedStatus,
        identifier: null,
        assigned_to: null
      };

      // Compare with existing item
      const shouldUpdate = !existingItem || 
        existingItem.checked !== checklistItem.checked ||
        existingItem.status !== checklistItem.status;

      if (!shouldUpdate) {
        console.log(`Skipping unchanged item: ${checklistItem.name}`);
        results.skippedCount++;
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
        results.failedItems.push({
          item,
          error: `Database update error: ${error.message}`
        });
        results.errorCount++;
        console.error(`Error updating item ${checklistItem.name}:`, error.message);
      } else {
        console.log(`Successfully updated item: ${checklistItem.name}`);
        results.updatedCount++;
      }
    } catch (error) {
      results.failedItems.push({
        item,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      results.errorCount++;
      console.error('Error processing item:', error);
    }
  }
  
  console.log(`Database update summary:`, {
    updated: results.updatedCount,
    skipped: results.skippedCount,
    errors: results.errorCount,
    failedItems: results.failedItems.map(f => ({
      title: f.item.title,
      error: f.error
    }))
  });
  
  return results;
}

// Add these utility functions at the top level
async function waitForElement(page: any, selector: string, timeout = 5000): Promise<any> {
  try {
    return await page.waitForSelector(selector, { timeout });
  } catch (error) {
    console.log(`Element not found with selector: ${selector}`);
    return null;
  }
}

async function getTextContent(element: any): Promise<string> {
  try {
    return await element.evaluate((el: Element) => el.textContent?.trim() || 'No title');
  } catch (error) {
    console.log('Error getting text content:', error);
    return 'No title';
  }
}

async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.log(`Retry ${i + 1}/${maxRetries} failed:`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

// Ensure RESOURCE_CONFIG is defined (copy from previous definition if missing)
const RESOURCE_CONFIG = {
  browser: {
    timeout: 30000, // 30 seconds
    maxConcurrentPages: 1,
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0'
  },
  operation: {
    pageLoadTimeout: 30000,
    elementWaitTimeout: 5000,
    navigationTimeout: 20000,
    cleanupTimeout: 5000
  }
};

// Ensure BrowserError is defined (copy from previous code if missing)
class BrowserError extends Error {
  constructor(message: string, details?: any) {
    super(message);
    this.name = 'BrowserError';
    (this as any).details = details;
  }
}

class ResourceManager {
  private browser: any = null;
  private contexts: any[] = [];
  private pages: any[] = [];
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(private config = RESOURCE_CONFIG) {}

  async initializeBrowser() {
    try {
      const isVercel = process.env.VERCEL === '1';
      const options = {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      };

      // Add Vercel environment logging (from File A)
      console.log(`Environment: ${isVercel ? 'Vercel' : 'Local'}`);
      console.log(`Node.js version: ${process.version}`);
      if (isVercel) {
        console.log('Vercel environment details:');
        console.log('- VERCEL_ENV:', process.env.VERCEL_ENV);
        console.log('- VERCEL_REGION:', process.env.VERCEL_REGION);
        console.log('- PLAYWRIGHT_BROWSERS_PATH:', process.env.PLAYWRIGHT_BROWSERS_PATH);
        try {
          console.log('- @sparticuz/chromium available:', !!chromium_path);
          console.log('- chromium_path properties:', Object.keys(chromium_path));
        } catch (error: any) {
          console.log('- @sparticuz/chromium not accessible:', error.message);
        }
      }

      if (isVercel) {
        process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
        const executablePath = await chromium_path.executablePath();
        console.log(`Using Chromium executable path: ${executablePath}`);
        this.browser = await chromium.launch({
          args: chromium_path.args,
          executablePath,
          headless: true,
        });
      } else {
        this.browser = await chromium.launch(options);
      }

      this.setupCleanupTimer();
      return this.browser;
    } catch (error: any) {
      throw new BrowserError('Failed to initialize browser', {
        error,
        operation: 'initializeBrowser'
      });
    }
  }

  async createContext() {
    try {
      // Use the same context options as File A
      const context = await this.browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0',
        extraHTTPHeaders: {
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
      this.contexts.push(context);
      return context;
    } catch (error: any) {
      throw new BrowserError('Failed to create browser context', {
        error,
        operation: 'createContext'
      });
    }
  }

  private setupCleanupTimer() {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
    }
    this.cleanupTimer = setTimeout(() => {
      this.cleanup().catch(console.error);
    }, this.config.operation.cleanupTimeout);
  }

  async cleanup() {
    // ... keep existing cleanup logic ...
  }
}

// Update the getStatus function with proper type annotations
async function getStatus(element: any): Promise<string> {
  // Define all possible status selectors and their corresponding status values
  const statusMappings = [
    { selector: 'p.chakra-text.css-143lvog', status: 'In progress' },
    { selector: 'p.chakra-text.css-7k3xhx', status: 'Submitted' },
    { selector: 'p.chakra-text.css-kqc7kz', status: 'Not started' }
  ];

  // First try: Direct child search
  for (const { selector, status } of statusMappings) {
    const statusElement = await element.$(selector);
    if (statusElement) {
      const text = await getTextContent(statusElement);
      if (text) {
        const validation = validateStatus(text);
        if (validation.isValid) {
          return validation.normalizedStatus!;
        }
      }
    }
  }

  // Second try: Parent element search
  const parentElement = await element.$('..');
  if (parentElement) {
    for (const { selector, status } of statusMappings) {
      const statusElement = await parentElement.$(selector);
      if (statusElement) {
        const text = await getTextContent(statusElement);
        if (text) {
          const validation = validateStatus(text);
          if (validation.isValid) {
            return validation.normalizedStatus!;
          }
        }
      }
    }
  }

  // Third try: Sibling element search
  const siblings = await element.$$('.. > div');
  for (const sibling of siblings) {
    for (const { selector, status } of statusMappings) {
      const statusElement = await sibling.$(selector);
      if (statusElement) {
        const text = await getTextContent(statusElement);
        if (text) {
          const validation = validateStatus(text);
          if (validation.isValid) {
            return validation.normalizedStatus!;
          }
        }
      }
    }
  }

  // Fourth try: Look for any element with known status text
  const allTextElements = await element.$$('p.chakra-text');
  for (const textElement of allTextElements) {
    const text = await getTextContent(textElement);
    const validation = validateStatus(text);
    if (validation.isValid) {
      return validation.normalizedStatus!;
    }
  }

  // Log detailed information for debugging
  console.log('Status element search failed. Element structure:', {
    elementHtml: await element.evaluate((el: Element) => el.outerHTML),
    parentHtml: await element.evaluate((el: Element) => el.parentElement?.outerHTML),
    allTextContent: await Promise.all(
      (await element.$$('p.chakra-text')).map((p: any) => getTextContent(p))
    )
  });

  throw new Error('Status element not found after trying all strategies');
}

// Add this new function before runScraper
async function logScraperMetrics(metrics: ScraperMetrics) {
  try {
    const { data, error } = await supabase
      .from('scraper_metrics')
      .insert([{
        start_time: new Date(metrics.startTime).toISOString(),
        end_time: new Date(metrics.endTime).toISOString(),
        duration_seconds: metrics.duration / 1000,
        memory_usage_mb: metrics.memoryUsage.heapUsed / (1024 * 1024),
        items_processed: metrics.itemsProcessed,
        success: metrics.success,
        error: metrics.error,
        environment: process.env.VERCEL_ENV || 'local'
      }]);

    if (error) {
      console.error('Failed to log metrics:', error);
    }
  } catch (error) {
    console.error('Error logging metrics:', error);
  }
}

// Update the runScraper function to include metrics
async function runScraper(): Promise<ScraperResult> {
  const metrics: ScraperMetrics = {
    startTime: Date.now(),
    endTime: 0,
    duration: 0,
    memoryUsage: process.memoryUsage(),
    itemsProcessed: 0,
    success: false
  };

  // Define browser as null so we can close it properly later
  let browser: any = null;
  
  try {
    // Add timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Scraper timed out after 4 minutes'));
      }, 240000); // 4 minutes timeout
    });

    // Wrap the main scraping logic in a race with the timeout
    const result = await Promise.race([
      (async () => {
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
        page.on('response', (response: Response) => {
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
        const isLoginPage = await page.content().then((html: string) => 
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
          
          // Wait longer for content to load
          await page.waitForTimeout(5000);
          
          // Wait for spinner to disappear
          await page.waitForSelector('.chakra-spinner', { state: 'detached', timeout: 15000 }).catch(() => {
            console.log('Spinner did not appear or already gone.');
          });

          // Wait for all items to be present and visible
          await page.waitForFunction(() => {
            const items = document.querySelectorAll('.css-8krjsn');
            return items.length > 0 && Array.from(items).every(item => {
              const element = item as HTMLElement;
              return element.offsetParent !== null;
            });
          }, { timeout: 15000 });

          // Log the full page HTML for debugging
          const pageHtml = await page.content();
          console.log('Full page HTML:', pageHtml);

          console.log('Reading items...');
          const itemHandles = await page.$$('.css-8krjsn');
          console.log(`Found ${itemHandles.length} items with class .css-8krjsn`);

          const processedItems: ScrapedItem[] = [];

          for (let i = 0; i < itemHandles.length; i++) {
            try {
              const itemHandle = itemHandles[i];
              await itemHandle.waitForElementState('visible', { timeout: 5000 });

              // Get the title
              const title = await retryOperation(async () => {
                const titleHandle = await itemHandle.$('p.chakra-text.css-qlwhay');
                if (!titleHandle) throw new Error('Title element not found');
                return await getTextContent(titleHandle);
              });

              // Get the status with multiple fallback strategies
              const status = await retryOperation(async () => {
                return await getStatus(itemHandle);
              });

              // Get the due date
              const dueDate = await retryOperation(async () => {
                // Try original selector
                const dueDateHandle = await itemHandle.$('p.chakra-text.css-jjn383');
                if (dueDateHandle) return await getTextContent(dueDateHandle);

                // Try DOM traversal for due date
                const dueDateText = await itemHandle.evaluate((el: Element) => {
                  // Next siblings
                  let sib = el.nextElementSibling;
                  while (sib) {
                    if (sib.matches && sib.matches('p.chakra-text.css-jjn383')) {
                      return sib.textContent?.trim() || null;
                    }
                    sib = sib.nextElementSibling;
                  }
                  // Parent children
                  if (el.parentElement) {
                    const found = el.parentElement.querySelector('p.chakra-text.css-jjn383');
                    if (found) return found.textContent?.trim() || null;
                  }
                  return null;
                });
                if (dueDateText) return dueDateText;

                // Debug log
                throw new Error('Due date element not found after trying all strategies');
              });

              processedItems.push({ title, status, dueDate });
              console.log(`Successfully processed item ${i + 1}/${itemHandles.length}:`, { title, status, dueDate });

              await itemHandle.dispose();
            } catch (error) {
              console.error(`Error processing item ${i}:`, error);
              // Continue with next item instead of failing completely
            }
          }
          
          console.log(`Processing ${processedItems.length} items...`);
          
          // Process and update checklist items in the database
          const updateResult = await processAndUpdateChecklist(processedItems);
          console.log('Database update completed');
          
          // Update metrics before returning
          metrics.itemsProcessed = processedItems.length;
          metrics.success = true;
          return {
            items: processedItems,
            updateResult
          };
        } else {
          throw new Error('Could not find "View all" link after trying multiple selectors');
        }
      })(),
      timeoutPromise
    ]) as ScraperResult;

    return result;
  } catch (error) {
    metrics.error = error instanceof Error ? error.message : 'Unknown error';
    throw error;
  } finally {
    // Update final metrics
    metrics.endTime = Date.now();
    metrics.duration = metrics.endTime - metrics.startTime;
    metrics.memoryUsage = process.memoryUsage();

    // Log metrics
    await logScraperMetrics(metrics);

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

// Update the POST handler to include better error handling
export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-vercel-id') || 'local-request';
  console.log(`Processing request ${requestId}`);
  
  try {
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
          errors: result.updateResult.errorCount,
          failedItems: result.updateResult.failedItems.map((f: { item: ScrapedItem; error: string }) => ({
            title: f.item.title,
            error: f.error
          }))
        }
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('API route error:', error);
    
    // Log the error to Supabase for monitoring
    try {
      await supabase
        .from('scraper_errors')
        .insert([{
          request_id: requestId,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack_trace: error instanceof Error ? error.stack : null,
          timestamp: new Date().toISOString(),
          environment: process.env.VERCEL_ENV || 'local'
        }]);
    } catch (dbError) {
      console.error('Failed to log error to database:', dbError);
    }
    
    // Return an error response
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