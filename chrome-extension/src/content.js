// Function to fill form fields
function fillFormField(labelText, value) {
  // Find all label elements
  const labels = Array.from(document.getElementsByTagName('label'));
  
  // Find the label that matches our text
  const label = labels.find(l => l.textContent.trim().includes(labelText));
  if (!label) return;

  // Get the input associated with this label
  const input = label.nextElementSibling?.querySelector('input');
  if (!input) return;

  // Set the value and dispatch events
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

// Function to check radio/checkbox options
function selectOption(labelText, optionText) {
  // Find the section with the given label
  const labels = Array.from(document.getElementsByTagName('label'));
  const sectionLabel = labels.find(l => l.textContent.trim().includes(labelText));
  if (!sectionLabel) return;

  // Find the checkbox/radio option
  const optionLabels = Array.from(document.getElementsByTagName('label'));
  const optionLabel = optionLabels.find(l => l.textContent.trim() === optionText);
  if (!optionLabel) return;

  // Get the input and click it
  const input = optionLabel.querySelector('input');
  if (input) {
    input.click();
  }
}

// Main function to fill the form
function fillForm(data) {
  // Fill name
  fillFormField('RANK / NAME', data.name);

  // Get today's date in dd/mm/yyyy format
  const today = new Date();
  const formattedDate = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;
  fillFormField('DUTY DATE', formattedDate);

  // Check if person has MRV assignments
  if (data.vessel_backplate && data.vessel_backplate.includes('BSTJ')) {
    selectOption('APPLIANCE TURNOUT', 'MRV 811');
    fillFormField('SCBA Set 1', `${data.vessel_backplate} / ${data.vessel_cylinder}`);
  }
  
  // Check if person has LFAV assignments
  if (data.lfav_backplate && data.lfav_backplate.includes('BSTJ')) {
    selectOption('APPLIANCE TURNOUT', 'LF 811');
    fillFormField('SCBA Set 1', `${data.lfav_backplate} / ${data.lfav_cylinder}`);
  }
}

// Listen for data from the main application
function init() {
  // Try to get data from localStorage
  const storedData = localStorage.getItem('formFillData');
  if (storedData) {
    try {
      const data = JSON.parse(storedData);
      // Only use data that's less than 5 minutes old
      const timestamp = new Date(data.timestamp);
      const now = new Date();
      if (now.getTime() - timestamp.getTime() < 5 * 60 * 1000) {
        fillForm(data);
      }
    } catch (error) {
      console.error('Error parsing form data:', error);
    }
  }
}

// Start the form filling process
setTimeout(init, 1000); // Wait for form to load 