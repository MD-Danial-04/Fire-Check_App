import { chromium } from 'playwright';

export interface FormData {
  name: string;
  date: string;
  rota: string;
  manning: string;
  appliances: string[];
  baSets: {
    mrv?: { backplate: string; cylinder: string };
    lf?: { backplate: string; cylinder: string };
  };
}

export async function fillForm(data: FormData) {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Navigate to the form
    await page.goto('https://form.gov.sg/65031149356d470012810f7f');
    
    // Wait for form fields to load
    await page.waitForSelector('input[type="text"]');
    
    // Fill name
    const nameInput = await page.locator('label:has-text("RANK / NAME")').locator('xpath=following::input').first();
    await nameInput.fill(data.name);

    // Fill rota
    const rotaSelect = await page.locator('label:has-text("ROTA")').locator('xpath=following::select').first();
    await rotaSelect.selectOption(data.rota);

    // Fill date
    const dateInput = await page.locator('label:has-text("DUTY DATE")').locator('xpath=following::input').first();
    await dateInput.fill(data.date);

    // Fill manning
    const manningSelect = await page.locator('label:has-text("MANNING OF APPLIANCES")').locator('xpath=following::select').first();
    await manningSelect.selectOption(data.manning);

    // Check appliance checkboxes
    for (const appliance of data.appliances) {
      const checkbox = await page.locator(`input[type="checkbox"][value="${appliance}"]`);
      await checkbox.check();
    }

    // Don't close the browser - let the user verify and submit
    return { success: true, message: 'Form filled successfully. Please verify and submit manually.' };
  } catch (error) {
    await browser.close();
    if (error instanceof Error) {
      return { success: false, message: error.message };
    }
    return { success: false, message: 'An unknown error occurred' };
  }
}