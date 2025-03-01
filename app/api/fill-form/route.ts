import { chromium } from 'playwright';
import { NextResponse } from 'next/server';

const MAX_RETRIES = 3;
const TIMEOUT = 60000; // 60 seconds

// Helper function to make logs stand out
const log = (message: string, type: 'info' | 'error' | 'warning' = 'info') => {
  const styles = {
    info: 'color: #00ff00; font-weight: bold;',
    error: 'color: #ff0000; font-weight: bold;',
    warning: 'color: #ffff00; font-weight: bold;'
  };
  console.log(`%c[Form Filler] ${message}`, styles[type]);
};

export async function POST(request: Request) {
  let browser;

  // Function to fill a field with retry logic
  async function fillFieldWithRetry(page: any, action: () => Promise<void>, actionName: string): Promise<void> {
    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        log(`Attempting ${actionName} (attempt ${i + 1}/${MAX_RETRIES})...`);
        await action();
        log(`Successfully completed ${actionName}`, 'info');
        return;
      } catch (error) {
        log(`Attempt ${i + 1} failed for ${actionName}: ${error}`, 'warning');
        if (i === MAX_RETRIES - 1) throw error;
        await page.waitForTimeout(2000); // Wait 2 seconds before retry
      }
    }
  }

  try {
    const data = await request.json();
    log('Starting browser with data: ' + JSON.stringify(data, null, 2));
    
    let wasSuccessful = false;  // Track if form filling was successful
    
    browser = await chromium.launch({ 
      headless: false,
      args: [
        '--enable-logging=stderr',
        '--v=1',
        '--enable-logging',
        '--log-level=0',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });
    
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      bypassCSP: true
    });

    const page = await context.newPage();
    
    // Enable console logging from the page
    page.on('console', msg => {
      log(`Page Console: ${msg.text()}`, msg.type() === 'error' ? 'error' : 'info');
    });
    
    // Log all errors
    page.on('pageerror', error => {
      log(`Page Error: ${error}`, 'error');
    });

    try {
      log('Navigating to form...');
      
      // Navigate to the form with a more reliable loading strategy
      try {
        await page.goto('https://form.gov.sg/65031149356d470012810f7f', {
          timeout: TIMEOUT,
          waitUntil: 'load'
        });

        // Wait for any iframe to be present
        log('Waiting for iframes to load...');
        await page.waitForTimeout(5000); // Give time for iframes to initialize

        // Get all frames in the page
        log('Looking for form frame...');
        const frames = page.frames();
        log(`Found ${frames.length} frames`);
        
        // Find the form frame
        let frame = null;
        for (const f of frames) {
          const url = f.url();
          log(`Checking frame URL: ${url}`);
          if (url.includes('form.gov.sg')) {
            frame = f;
            break;
          }
        }

        if (!frame) {
          throw new Error('Could not find form frame');
        }

        log('Successfully found form frame');
        
        // Wait for the form to be interactive
        await frame.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000); // Additional wait for JavaScript

        // Wait for key elements in the frame to be sure it's loaded
        await Promise.race([
          frame.waitForSelector('input[aria-label="1. RANK / NAME"]', { timeout: TIMEOUT }),
          frame.waitForSelector('form', { timeout: TIMEOUT })
        ]);
        
        await page.waitForTimeout(2000); // Give extra time for JavaScript to initialize

        // Fill name with retry
        await fillFieldWithRetry(
          page,
          async () => {
            log('Looking for name field...');
            const nameInput = await frame.waitForSelector('input[aria-label="1. RANK / NAME"]', { timeout: TIMEOUT });
            await nameInput.click();
            await nameInput.fill(data.name);
            log('Name field filled');
          },
          'filling name'
        );

        // Fill rota with retry
        await fillFieldWithRetry(
          page,
          async () => {
            log('Looking for rota field...');
            // Find and click the rota input by its role
            const rotaInput = await frame.waitForSelector('input[role="combobox"][aria-controls="downshift-0-menu"]', { timeout: TIMEOUT });
            await rotaInput.click();
            await page.waitForTimeout(1000); // Wait longer for dropdown to fully open
            
            log(`Selecting option: ${data.rota}`);
            // Click the specific option in the dropdown
            const rotaOption = await frame.waitForSelector(`li[role="option"] p span:has-text("${data.rota}")`, { timeout: TIMEOUT });
            await rotaOption.click();
            await page.waitForTimeout(500); // Wait for selection to register
            
            log('Rota field filled');
          },
          'filling rota'
        );

        // Fill date with retry
        await fillFieldWithRetry(
          page,
          async () => {
            log('Looking for date field...');
            // Find the date input by its placeholder and input mode
            const dateInput = await frame.waitForSelector('input[inputmode="numeric"][placeholder="dd/mm/yyyy"]', { timeout: TIMEOUT });
            await dateInput.click();
            
            // Clear any existing value
            await dateInput.fill('');
            await page.waitForTimeout(500);
            
            // Type the date character by character to ensure proper formatting
            for (const char of data.date) {
              await frame.type('input[inputmode="numeric"]', char);
              await page.waitForTimeout(100); // Small delay between characters
            }
            
            log('Date field filled');
          },
          'filling date'
        );

        // Fill manning with retry
        await fillFieldWithRetry(
          page,
          async () => {
            log('Looking for manning field...');
            // Find and click the manning input by its role and controls attribute
            const manningInput = await frame.waitForSelector('input[role="combobox"][aria-controls="downshift-1-menu"]', { timeout: TIMEOUT });
            await manningInput.click();
            await page.waitForTimeout(1000); // Wait longer for dropdown to fully open
            
            log(`Selecting option: ${data.manning}`);
            // Click the specific option in the dropdown using the exact structure
            const manningOption = await frame.waitForSelector(`li[role="option"] p span:has-text("${data.manning.toUpperCase()}")`, { timeout: TIMEOUT });
            await manningOption.click();
            await page.waitForTimeout(500); // Wait for selection to register
            
            log('Manning field filled');
          },
          'filling manning'
        );

        // Check appliance checkboxes with retry
        log('Starting appliance turnout section...');
        for (const appliance of data.appliances) {
          await fillFieldWithRetry(
            page,
            async () => {
              // Format the appliance name to match the form (add space before numbers)
              const formattedAppliance = appliance.replace(/(\d+)/, ' $1'); // e.g., "MRV811" -> "MRV 811"
              log(`Looking for appliance checkbox: ${formattedAppliance}`);
              
              // Find and click the checkbox label by its text content
              const label = await frame.waitForSelector(`span.chakra-checkbox__label:text("${formattedAppliance}")`, { timeout: TIMEOUT });
              await label.click();
              
              // Wait for the checkbox state to update
              await page.waitForTimeout(500);
              
              log(`Appliance ${formattedAppliance} checked`);
            },
            `checking ${appliance}`
          );
        }

        // Fill SCBA Set 1 with retry - For vessel BA (MRV/RFV)
        await fillFieldWithRetry(
          page,
          async () => {
            log('Looking for SCBA Set 1 field...');
            const scbaInput = await frame.waitForSelector('input[aria-label="16. SCBA Set 1"]', { timeout: TIMEOUT });
            
            // Determine which vessel appliance we have (MRV or RFV)
            const vesselAppliance = data.appliances.find((a: string) => a.includes('MRV') || a.includes('RFV'));
            if (!vesselAppliance) {
              throw new Error('No vessel appliance (MRV/RFV) found');
            }
            
            // Format the appliance name with a space
            const formattedAppliance = vesselAppliance.replace(/(\d+)/, ' $1');
            
            // Use the vessel BA set data if available, otherwise use N.A
            const baSet = data.baSets.vessel;
            const scbaSet = baSet 
              ? `${formattedAppliance} / ${baSet.backplate} / ${baSet.cylinder}`
              : `${formattedAppliance} / N.A / N.A`;
            
            await scbaInput.click();
            await scbaInput.fill(scbaSet);
            log('SCBA Set 1 field filled');
          },
          'filling SCBA Set 1'
        );

        // Fill SCBA Set 2 if LF appliance exists - For LFAV BA (LF811/LF812)
        const lfAppliance = data.appliances.find((a: string) => a.includes('LF'));
        if (lfAppliance) {
          await fillFieldWithRetry(
            page,
            async () => {
              log('Looking for SCBA Set 2 field...');
              const scbaInput = await frame.waitForSelector('input[aria-label="18. SCBA Set 2"]', { timeout: TIMEOUT });
              
              // Format the appliance name with a space
              const formattedAppliance = lfAppliance.replace(/(\d+)/, ' $1');
              
              // Use the LF BA set data if available, otherwise use N.A
              const baSet = data.baSets.lf;
              const scbaSet = baSet 
                ? `${formattedAppliance} / ${baSet.backplate} / ${baSet.cylinder}`
                : `${formattedAppliance} / N.A / N.A`;
              
              await scbaInput.click();
              await scbaInput.fill(scbaSet);
              log('SCBA Set 2 field filled');
            },
            'filling SCBA Set 2'
          );
        }

        log('Form filling completed successfully', 'info');
        wasSuccessful = true;  // Mark as successful
        
        // Keep the browser open for verification
        return NextResponse.json({ 
          success: true, 
          message: 'Form filled successfully. Please verify and submit manually.' 
        });
      } catch (error) {
        log(`Form filling error: ${error}`, 'error');
        if (error instanceof Error) {
          return NextResponse.json({ 
            success: false, 
            message: `Failed to fill form: ${error.message}. Please try again or fill manually.` 
          }, { status: 500 });
        }
        return NextResponse.json({ 
          success: false, 
          message: 'An unknown error occurred. Please try again or fill manually.' 
        }, { status: 500 });
      }
    } catch (error) {
      log(`Request error: ${error}`, 'error');
      return NextResponse.json({ 
        success: false, 
        message: 'Invalid request data. Please try again.' 
      }, { status: 400 });
    } finally {
      // Only close the browser if there was an error
      if (browser && !wasSuccessful) {
        await browser.close();
      }
    }
  } catch (error) {
    log(`Request error: ${error}`, 'error');
    return NextResponse.json({ 
      success: false, 
      message: 'Invalid request data. Please try again.' 
    }, { status: 400 });
  }
} 