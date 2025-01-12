async function insertVehicleAssignments() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  const vehicleSheet = sheet.getSheetByName('Vehicle Assignment');
  
  if (!vehicleSheet) {
    Logger.log('Error: Sheet not found');
    return;
  }

  const data = vehicleSheet.getDataRange().getValues();
  Logger.log('Total rows:', data.length);
  
  const assignments = [];
  let currentVehicle = '';
  let currentSection = '';
  
  try {
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      Logger.log(`Processing row ${i + 1}:`, JSON.stringify(row));

      // Check if we have data in the first column
      if (row[0]) {
        const text = row[0].toString().trim();
        const upperText = text.toUpperCase();
        
        // Check for MRV811 header
        if (upperText === 'MRV811') {
          currentVehicle = 'MRV811';
          currentSection = 'COMMAND';
          Logger.log(`Found vehicle: ${currentVehicle}, section: ${currentSection}`);
          continue;
        }
        
        // Check for section headers
        if (upperText.includes('BRIDGE CREW')) {
          currentSection = 'BRIDGE';
          Logger.log(`Found section: ${currentSection}`);
          continue;
        } else if (upperText.includes('SECTION 1')) {
          currentSection = 'SECTION 1';
          Logger.log(`Found section: ${currentSection}`);
          continue;
        } else if (upperText.includes('SECTION 2')) {
          currentSection = 'SECTION 2';
          Logger.log(`Found section: ${currentSection}`);
          continue;
        } else if (upperText.includes('SECTION 3')) {
          currentSection = 'SECTION 3';
          Logger.log(`Found section: ${currentSection}`);
          continue;
        }

        // Process assignments if we have a name in column B
        if (currentVehicle && currentSection && row[1]) {
          // Only add if position is not empty and not a header
          if (text && !upperText.includes('SECTION') && !upperText.includes('CREW')) {
            Logger.log(`Processing assignment for position: ${text}, name: ${row[1]}`);
            const assignment = {
              vehicle_type: currentVehicle,
              section: currentSection,
              position: text,
              personnel_name: row[1].toString().trim()
            };
            Logger.log('Adding assignment 1:', JSON.stringify(assignment));
            assignments.push(assignment);
          }
        }
        
        // Process second pair if we have data in columns C and D
        if (currentVehicle && currentSection && row[2] && row[3]) {
          const position = row[2].toString().trim();
          const upperPosition = position.toUpperCase();
          
          // Only add if position is not empty and not a header
          if (position && !upperPosition.includes('SECTION') && !upperPosition.includes('CREW')) {
            Logger.log(`Processing assignment for position: ${position}, name: ${row[3]}`);
            const assignment = {
              vehicle_type: currentVehicle,
              section: currentSection,
              position: position,
              personnel_name: row[3].toString().trim()
            };
            Logger.log('Adding assignment 2:', JSON.stringify(assignment));
            assignments.push(assignment);
          }
        }
      }
    }
    
    if (assignments.length === 0) {
      Logger.log('No assignments to insert');
      return;
    }
    
    Logger.log('Assignments to insert:', JSON.stringify(assignments, null, 2));
    
    const supabase = new Supabase(SUPABASE_URL, SUPABASE_KEY);
    await supabase.deleteAllRows('vehicle_assignments');
    const result = await supabase.insertRows('vehicle_assignments', assignments);
    
    Logger.log('Successfully inserted assignments');
    return result;
  } catch (error) {
    Logger.log('Error:', error.toString());
    throw error;
  }
} 