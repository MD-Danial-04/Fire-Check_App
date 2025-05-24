import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright-core';
import chromium_path from '@sparticuz/chromium';

// Custom Error Classes
class ScraperError extends Error {
  constructor(
    message: string,
    public readonly type: string,
    public readonly details?: any,
    public readonly timestamp: string = new Date().toISOString()
  ) {
    super(message);
    this.name = 'ScraperError';
  }
}

class DatabaseError extends ScraperError {
  constructor(message: string, details?: any) {
    super(message, 'DATABASE_ERROR', details);
    this.name = 'DatabaseError';
  }
}

class BrowserError extends ScraperError {
  constructor(message: string, details?: any) {
    super(message, 'BROWSER_ERROR', details);
    this.name = 'BrowserError';
  }
}

class SessionError extends ScraperError {
  constructor(message: string, details?: any) {
    super(message, 'SESSION_ERROR', details);
    this.name = 'SessionError';
  }
}

class ValidationError extends ScraperError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

// Error Response Interface
interface ErrorResponse {
  success: false;
  message: string;
  requestId: string;
  error: {
    type: string;
    message: string;
    details?: any;
    timestamp: string;
  };
}

// Success Response Interface
interface SuccessResponse {
  success: true;
  message: string;
  requestId: string;
  details: {
    itemsProcessed: number;
    updatedItems: number;
    skippedItems: number;
    errors: number;
    executionTime?: number;
  };
}

// Error Handler
function handleError(error: unknown, requestId: string): ErrorResponse {
  console.error('Error details:', error);
  
  if (error instanceof ScraperError) {
    return {
      success: false,
      message: 'Scraper operation failed',
      requestId,
      error: {
        type: error.type,
        message: error.message,
        details: error.details,
        timestamp: error.timestamp
      }
    };
  }
  
  if (error instanceof Error) {
    return {
      success: false,
      message: 'Unexpected error occurred',
      requestId,
      error: {
        type: 'UNKNOWN_ERROR',
        message: error.message,
        details: error.stack,
        timestamp: new Date().toISOString()
      }
    };
  }
  
  return {
    success: false,
    message: 'Unknown error occurred',
    requestId,
    error: {
      type: 'UNKNOWN_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString()
    }
  };
}

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

// Retry Configuration
interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffFactor: number;
  shouldRetry: (error: unknown) => boolean;
}

// Default retry configurations for different operations
const retryConfigs: Record<string, RetryConfig> = {
  database: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2,
    shouldRetry: (error: unknown) => {
      if (error instanceof DatabaseError) {
        // Retry on connection errors or temporary failures
        return error.message.includes('connection') || 
               error.message.includes('timeout') ||
               error.message.includes('temporary');
      }
      return false;
    }
  },
  browser: {
    maxRetries: 2,
    initialDelay: 2000,
    maxDelay: 8000,
    backoffFactor: 2,
    shouldRetry: (error: unknown) => {
      if (error instanceof BrowserError) {
        // Retry on navigation errors or temporary browser issues
        return error.message.includes('navigation') ||
               error.message.includes('timeout') ||
               error.message.includes('network');
      }
      return false;
    }
  },
  session: {
    maxRetries: 2,
    initialDelay: 1000,
    maxDelay: 5000,
    backoffFactor: 2,
    shouldRetry: (error: unknown) => {
      if (error instanceof SessionError) {
        // Retry on session expiration or temporary auth issues
        return error.message.includes('expired') ||
               error.message.includes('auth') ||
               error.message.includes('temporary');
      }
      return false;
    }
  }
};

// Enhanced retry function with exponential backoff
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: RetryConfig,
  context: string
): Promise<T> {
  let lastError: unknown;
  let delay = config.initialDelay;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // Check if we should retry this error
      if (!config.shouldRetry(error)) {
        throw error;
      }

      // Log retry attempt
      console.log(`Retry attempt ${attempt}/${config.maxRetries} for ${context} failed:`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        nextRetryIn: delay,
        timestamp: new Date().toISOString()
      });

      // If this was the last attempt, throw the error
      if (attempt === config.maxRetries) {
        throw error;
      }

      // Wait before next retry
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Calculate next delay with exponential backoff
      delay = Math.min(delay * config.backoffFactor, config.maxDelay);
    }
  }

  throw lastError;
}

// Update loadSessionFromDatabase to use retries
async function loadSessionFromDatabase(): Promise<SessionData> {
  return retryWithBackoff(
    async () => {
      try {
        const { data, error } = await supabase
          .from('browser_sessions')
          .select('session_data')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        if (error) {
          throw new DatabaseError('Failed to load session from database', {
            error,
            operation: 'loadSessionFromDatabase'
          });
        }
        
        if (!data || !data.session_data) {
          throw new SessionError('No valid session found in database', {
            data,
            operation: 'loadSessionFromDatabase'
          });
        }
        
        return data.session_data as SessionData;
      } catch (error) {
        if (error instanceof ScraperError) {
          throw error;
        }
        throw new DatabaseError('Unexpected error loading session', {
          originalError: error,
          operation: 'loadSessionFromDatabase'
        });
      }
    },
    retryConfigs.database,
    'loadSessionFromDatabase'
  );
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
  const errors: Array<{ item: string; error: any }> = [];

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

      // Retry database operations
      const { data: existingItem, error: fetchError } = await retryWithBackoff(
        async () => {
          const result = await supabase
            .from('equipment_checklist')
            .select('*')
            .eq('section', 'ARMOURY')
            .eq('item_id', mappedItem.id)
            .single();
          
          if (result.error && result.error.code !== 'PGRST116') {
            throw new DatabaseError(`Error fetching existing item ${mappedItem.name}`, {
              error: result.error,
              item: mappedItem,
              operation: 'fetchExistingItem'
            });
          }
          
          return result;
        },
        retryConfigs.database,
        `fetchExistingItem-${mappedItem.id}`
      );

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

      if (!shouldUpdate) {
        console.log(`Skipping unchanged item: ${checklistItem.name}`);
        skippedCount++;
        continue;
      }
      
      // Retry update operation
      await retryWithBackoff(
        async () => {
          const { error: updateError } = await supabase
            .from('equipment_checklist')
            .upsert(
              checklistItem,
              { 
                onConflict: 'section,item_id',
                ignoreDuplicates: false 
              }
            );
          
          if (updateError) {
            throw new DatabaseError(`Error updating item ${checklistItem.name}`, {
              error: updateError,
              item: checklistItem,
              operation: 'updateItem'
            });
          }
        },
        retryConfigs.database,
        `updateItem-${checklistItem.item_id}`
      );
      
      console.log(`Successfully updated item: ${checklistItem.name}`);
      updatedCount++;
    } catch (error) {
      errorCount++;
      errors.push({
        item: item.title,
        error: error instanceof ScraperError ? {
          type: error.type,
          message: error.message,
          details: error.details
        } : error
      });
      console.error('Error processing item:', error);
    }
  }
  
  console.log(`Database update summary: ${updatedCount} updated, ${skippedCount} skipped, ${errorCount} errors`);
  return { 
    updatedCount, 
    skippedCount, 
    errorCount,
    errors: errors.length > 0 ? errors : undefined
  };
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

// Resource Management Configuration
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

// Resource Management Utilities
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

      if (isVercel) {
        process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
        const executablePath = await chromium_path.executablePath();
        this.browser = await chromium.launch({
          args: chromium_path.args,
          executablePath,
          headless: true,
        });
      } else {
        this.browser = await chromium.launch(options);
      }

      // Set up cleanup timer
      this.setupCleanupTimer();
      return this.browser;
    } catch (error) {
      throw new BrowserError('Failed to initialize browser', {
        error,
        operation: 'initializeBrowser'
      });
    }
  }

  async createContext() {
    try {
      const context = await this.browser.newContext({
        viewport: this.config.browser.viewport,
        userAgent: this.config.browser.userAgent,
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
    } catch (error) {
      throw new BrowserError('Failed to create browser context', {
        error,
        operation: 'createContext'
      });
    }
  }

  async createPage(context: any) {
    try {
      if (this.pages.length >= this.config.browser.maxConcurrentPages) {
        throw new BrowserError('Maximum concurrent pages limit reached');
      }
      const page = await context.newPage();
      this.pages.push(page);
      return page;
    } catch (error) {
      throw new BrowserError('Failed to create page', {
        error,
        operation: 'createPage'
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
    console.log('Starting resource cleanup...');
    const cleanupStart = Date.now();

    try {
      // Close all pages
      for (const page of this.pages) {
        try {
          await page.close();
        } catch (error) {
          console.error('Error closing page:', error);
        }
      }
      this.pages = [];

      // Close all contexts
      for (const context of this.contexts) {
        try {
          await context.close();
        } catch (error) {
          console.error('Error closing context:', error);
        }
      }
      this.contexts = [];

      // Close browser
      if (this.browser) {
        try {
          await this.browser.close();
        } catch (error) {
          console.error('Error closing browser:', error);
        }
        this.browser = null;
      }

      // Clear cleanup timer
      if (this.cleanupTimer) {
        clearTimeout(this.cleanupTimer);
        this.cleanupTimer = null;
      }

      console.log(`Resource cleanup completed in ${Date.now() - cleanupStart}ms`);
    } catch (error) {
      console.error('Error during resource cleanup:', error);
      throw new BrowserError('Failed to cleanup resources', {
        error,
        operation: 'cleanup'
      });
    }
  }
}

// Update runScraper to use ResourceManager
async function runScraper() {
  const resourceManager = new ResourceManager();
  const startTime = Date.now();
  let result = null;
  let error = null;
  try {
    // Validate environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new ValidationError('Missing required environment variables for Supabase connection');
    }
    // Initialize browser
    const browser = await resourceManager.initializeBrowser();
    // Load session data
    const sessionData = await loadSessionFromDatabase();
    // Create context and set cookies
    const context = await resourceManager.createContext();
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
    // Create page and navigate
    const page = await resourceManager.createPage(context);
    // Set up timeout for page load
    const pageLoadPromise = page.goto('https://armoury.gov.sg/lists', {
      waitUntil: 'domcontentloaded',
      timeout: RESOURCE_CONFIG.operation.pageLoadTimeout
    });
    // Race between page load and timeout
    await Promise.race([
      pageLoadPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new BrowserError('Page load timeout')), 
        RESOURCE_CONFIG.operation.pageLoadTimeout)
      )
    ]);
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
    // Find View all element using a robust selector
    console.log('Looking for "View all" element...');
    let viewAllElement = null;
    for (let i = 0; i < 20; i++) {
      try {
        const viewAllElements = await page.$$('p.chakra-text.css-10ahl1q');
        for (const el of viewAllElements) {
          const text = await el.textContent();
          if (text && text.trim().toLowerCase().startsWith('view all')) {
            viewAllElement = el;
            break;
          }
        }
        if (viewAllElement) break;
        await page.waitForTimeout(500);
      } catch (err) {
        if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string' && err.message.includes('has been closed')) {
          console.error('Page or browser was closed during View all search loop.');
          break;
        }
        throw err;
      }
    }
    if (!viewAllElement) {
      let htmlSnippet = '';
      try {
        htmlSnippet = await page.content();
      } catch (err) {
        htmlSnippet = 'Page closed, no HTML available';
      }
      console.error('Could not find "View all" element after waiting. HTML snippet:', htmlSnippet.slice(0, 1000));
      throw new Error('Could not find "View all" link after waiting');
    }
    console.log('Clicking "View all" element and waiting for content to load...');
    await viewAllElement.click();
    // Wait for the content to be fully loaded
    await page.waitForTimeout(2000); // Initial wait for content to start loading
    // Wait for the items to be present and stable
    await page.waitForFunction(
      () => {
        const items = document.querySelectorAll('.css-8krjsn');
        return items.length > 0 && Array.from(items).every(item => {
          const element = item as HTMLElement;
          return element.offsetParent !== null;
        });
      },
      { timeout: 10000 }
    );
    console.log('Reading items...');
    const items = await page.$$('.css-8krjsn');
    console.log(`Found ${items.length} items with class .css-8krjsn`);
    const processedItems: ScrapedItem[] = [];
    for (let i = 0; i < items.length; i++) {
      try {
        // Get fresh reference to items on each iteration
        const currentItems = await page.$$('.css-8krjsn');
        if (i >= currentItems.length) {
          console.log(`Item ${i} no longer available, skipping...`);
          continue;
        }
        const item = currentItems[i];
        // Wait for the item to be visible with retry
        await retryOperation(
          async () => {
            await item.waitForElementState('visible', { timeout: 5000 });
          },
          3,  // max retries
          1000 // delay between retries
        );
        // Get the title with retry logic
        const title = await retryOperation(async () => {
          const titleElement = await item.$('p.chakra-text.css-qlwhay');
          if (!titleElement) {
            throw new Error('Title element not found');
          }
          return await getTextContent(titleElement);
        });
        // Get the current item's position
        const itemIndex = await page.evaluate((el: Element) => {
          const allItems = Array.from(document.querySelectorAll('.css-8krjsn'));
          return allItems.indexOf(el);
        }, item);
        // Wait for the details div to be visible with retry
        await retryOperation(
          async () => {
            await page.waitForFunction(
              (index: number) => {
                const items = document.querySelectorAll('.css-8krjsn');
                if (items[index]) {
                  const detailsDiv = items[index].nextElementSibling as HTMLElement;
                  return detailsDiv && detailsDiv.offsetParent !== null;
                }
                return false;
              },
              itemIndex,
              { timeout: 5000 }
            );
          },
          3,
          1000
        );
        // Get status with retry logic
        const status = await retryOperation(async () => {
          const statusSelectors = [
            '.css-1jcdzpd p.chakra-text',
            '.css-o5vkw1 p.chakra-text',
            '.css-181ukw4 p.chakra-text',
            'p.chakra-text' // Fallback selector
          ];
          for (const selector of statusSelectors) {
            const statusElement = await page.evaluate(
              (data: any) => {
                const { selector, index } = data;
                const items = document.querySelectorAll('.css-8krjsn');
                if (items[index]) {
                  const detailsDiv = items[index].nextElementSibling;
                  if (detailsDiv) {
                    const statusEl = detailsDiv.querySelector(selector);
                    return statusEl ? statusEl.textContent?.trim() : null;
                  }
                }
                return null;
              },
              { selector, index: itemIndex }
            );
            if (statusElement) {
              return statusElement;
            }
          }
          throw new Error('Status not found with any selector');
        });
        // Get due date with retry logic
        const dueDate = await retryOperation(async () => {
          const dueDateElement = await page.evaluate(
            (index: number) => {
              const items = document.querySelectorAll('.css-8krjsn');
              if (items[index]) {
                const detailsDiv = items[index].nextElementSibling;
                if (detailsDiv) {
                  const dueDateEl = detailsDiv.querySelector('p.chakra-text.css-jjn383');
                  return dueDateEl ? dueDateEl.textContent?.trim() : null;
                }
              }
              return null;
            },
            itemIndex
          );
          if (!dueDateElement) {
            throw new Error('Due date element not found');
          }
          return dueDateElement;
        });
        processedItems.push({
          title,
          status: status || 'Unknown',
          dueDate: dueDate || 'No due date'
        });
        console.log(`Successfully processed item ${i + 1}/${items.length}:`, {
          title,
          status,
          dueDate
        });
      } catch (error) {
        console.error(`Error processing item ${i}:`, error);
        // Continue with next item instead of failing completely
      }
    }
    console.log(`Processing ${processedItems.length} items...`);
    // Process and update checklist items
    result = await processAndUpdateChecklist(processedItems);
    console.log('Database update completed');
    return {
      items: processedItems,
      updateResult: result,
      executionTime: Date.now() - startTime
    };
  } catch (err) {
    error = err;
    console.error('Scraper error:', err instanceof Error ? err.message : 'Unknown error');
    if (process.env.VERCEL === '1') {
      console.error('Detailed error information:', err);
      if (err instanceof Error && err.stack) {
        console.error('Stack trace:', err.stack);
      }
    }
    throw err;
  } finally {
    // Ensure resources are cleaned up only after all scraping and async work is complete
    await resourceManager.cleanup();
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = request.headers.get('x-vercel-id') || 'local-request';
  console.log(`Processing request ${requestId}`);
  
  try {
    // Run the scraper
    const result = await runScraper();
    
    // Calculate execution time
    const executionTime = Date.now() - startTime;
    
    // Return a successful response
    const response: SuccessResponse = {
      success: true,
      message: 'Scraper ran successfully',
      requestId,
      details: {
        itemsProcessed: result.items.length,
        updatedItems: result.updateResult.updatedCount,
        skippedItems: result.updateResult.skippedCount,
        errors: result.updateResult.errorCount,
        executionTime
      }
    };
    
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const errorResponse = handleError(error, requestId);
    return NextResponse.json(errorResponse, { status: 500 });
  }
}

// Also support GET requests for easier testing
export async function GET() {
  const startTime = Date.now();
  const requestId = 'cron-job-' + new Date().toISOString();
  console.log(`Processing cron job request ${requestId}`);
  
  try {
    // Run the scraper
    const result = await runScraper();
    
    // Calculate execution time
    const executionTime = Date.now() - startTime;
    
    // Return a successful response
    const response: SuccessResponse = {
      success: true,
      message: 'Scraper ran successfully via cron',
      requestId,
      details: {
        itemsProcessed: result.items.length,
        updatedItems: result.updateResult.updatedCount,
        skippedItems: result.updateResult.skippedCount,
        errors: result.updateResult.errorCount,
        executionTime
      }
    };
    
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const errorResponse = handleError(error, requestId);
    return NextResponse.json(errorResponse, { status: 500 });
  }
}