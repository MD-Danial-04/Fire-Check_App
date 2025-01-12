// Function to insert personnel data
async function insertPersonnelData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  const personnelSheet = sheet.getSheetByName('Manning');
  
  if (!personnelSheet) {
    Logger.log('Error: Personnel sheet not found');
    return;
  }

  try {
    // Get duty section commander and date
    const dutyCommanderCell = personnelSheet.getRange('B9').getValue();
    const dutyDateCell = personnelSheet.getRange('B10').getValue();
    
    Logger.log('Raw duty info:', {
      commander: dutyCommanderCell,
      date: dutyDateCell
    });

    // Parse the date
    let parsedDate = null;
    if (dutyDateCell) {
      try {
        // Remove any day of week if present (e.g., "Friday, 10.01.2025")
        const cleanDate = dutyDateCell.includes(',') ? 
          dutyDateCell.split(',')[1].trim() : 
          dutyDateCell.trim();
        
        Logger.log('Clean date:', cleanDate);
        
        // Try different date separators
        let dateParts;
        if (cleanDate.includes('.')) {
          dateParts = cleanDate.split('.');
        } else if (cleanDate.includes('/')) {
          dateParts = cleanDate.split('/');
        } else if (cleanDate.includes('-')) {
          dateParts = cleanDate.split('-');
        } else {
          throw new Error('Unknown date format');
        }
        
        Logger.log('Date parts:', dateParts);
        
        if (dateParts && dateParts.length === 3) {
          const [day, month, year] = dateParts.map(part => part.trim());
          // Ensure we have valid numbers
          if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
            parsedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            Logger.log('Parsed date:', parsedDate);
          } else {
            throw new Error('Invalid date numbers');
          }
        } else {
          throw new Error('Invalid date parts');
        }
      } catch (dateError) {
        Logger.log('Error parsing date:', dateError);
        // If date parsing fails, use today's date as fallback
        const today = new Date();
        parsedDate = today.toISOString().split('T')[0];
        Logger.log('Using fallback date:', parsedDate);
      }
    }

    // Prepare duty info for insertion
    const dutyInfo = {
      duty_section_commander: dutyCommanderCell,
      date: parsedDate,
      created_at: new Date().toISOString()
    };

    const supabase = new Supabase(SUPABASE_URL, SUPABASE_KEY);
    
    // Insert duty info first
    Logger.log('Inserting duty info:', JSON.stringify(dutyInfo));
    await supabase.deleteAllRows('duty_info');
    await supabase.insertRows('duty_info', [dutyInfo]);
    Logger.log('Successfully inserted duty info');

    // Get personnel data
    const data = personnelSheet.getRange('A12:C50').getValues();
    const personnel = [];
    let currentRole = '';

    // Define BA role patterns
    const baRolePatterns = [
      'BA TEAM LEADER',
      'BA TEAM',
      'BA ENTRY CONTROL OFFICER',
      'EMERGENCY CREW',
      'BRIDGE CREW',
      'SECTION 1',
      'SECTION 2',
      'SECTION 3'
    ];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      Logger.log(`Processing row ${i + 12}:`, JSON.stringify(row));

      // Check if this is a role header
      const firstCol = (row[0] || '').toString().trim().toUpperCase();
      const isRoleHeader = baRolePatterns.some(pattern => firstCol.includes(pattern));

      if (isRoleHeader) {
        currentRole = firstCol;
        Logger.log(`Found role header: ${currentRole}`);
        continue;
      }
      
      // Process personnel data
      const serialText = row[0] ? row[0].toString().trim() : '';  // Column A
      const nameText = row[1] ? row[1].toString().trim() : '';    // Column B
      const status = row[2] ? row[2].toString().trim() : '';      // Column C
      
      // Process if we have a name and it's not empty
      if (nameText && nameText !== '') {
        // Split rank and name
        const nameParts = nameText.split(' ');
        const rank = nameParts[0];
        const name = nameParts.slice(1).join(' ');
        
        // Log for debugging
        Logger.log(`Processing ${rank} ${name}:`, {
          serial: serialText,
          rank,
          name,
          role: currentRole,
          status: status || 'ON DUTY'
        });
        
        const person = {
          serial_no: serialText || null,  // Some might not have serial numbers
          rank: rank,
          name: name,
          role: currentRole,
          status: status || 'ON DUTY'
        };
        
        Logger.log(`Adding person:`, JSON.stringify(person));
        personnel.push(person);
      }
    }
    
    if (personnel.length === 0) {
      Logger.log('No personnel data to insert');
      return;
    }
    
    Logger.log(`Found ${personnel.length} personnel to insert:`, JSON.stringify(personnel, null, 2));
    
    // Delete existing personnel and insert new data
    Logger.log('Deleting existing personnel data...');
    await supabase.deleteAllRows('personnel');
    
    // Insert new personnel
    const result = await supabase.insertRows('personnel', personnel);
    Logger.log('Successfully inserted personnel data:', JSON.stringify(result));
    return result;
  } catch (error) {
    Logger.log('Error:', error.toString());
    throw error;
  }
}

// Function to insert BA assignments
async function insertBAAssignments() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  const vehicleSheet = sheet.getSheetByName('Manning');
  
  if (!vehicleSheet) {
    Logger.log('Error: Sheet not found');
    return;
  }

  try {
    const supabase = new Supabase(SUPABASE_URL, SUPABASE_KEY);
    
    // Get all vehicle assignments
    const vehicleAssignments = await supabase.getAllRows('vehicle_assignments');
    Logger.log('Retrieved vehicle assignments:', vehicleAssignments);

    const baAssignments = [];

    // Process each vehicle assignment
    for (const assignment of vehicleAssignments) {
      const { vehicle_type, section, position, personnel_name } = assignment;
      
      // Only process sections 1, 2, and 3
      if (!section.includes('SECTION')) continue;
      
      // Get the section number
      const sectionNum = section.match(/\d+/)[0];
      
      // Calculate BA set number based on position within section
      let baSetNumber;
      if (position.includes('Commander')) {
        if (position.includes('Deputy')) {
          baSetNumber = (parseInt(sectionNum) - 1) * 3 + 2; // Second BA set in section
        } else {
          baSetNumber = (parseInt(sectionNum) - 1) * 3 + 1; // First BA set in section
        }
      } else if (position.includes('Firefighter')) {
        baSetNumber = (parseInt(sectionNum) - 1) * 3 + 3; // Third BA set in section
      }

      if (baSetNumber) {
        const baAssignment = {
          ba_set_id: `BA_SET_${baSetNumber}`,
          vehicle_type,
          section,
          position,
          personnel_name,
          created_at: new Date().toISOString()
        };
        
        Logger.log(`Adding BA assignment: ${JSON.stringify(baAssignment)}`);
        baAssignments.push(baAssignment);
      }
    }

    if (baAssignments.length > 0) {
      Logger.log('BA assignments to insert:', JSON.stringify(baAssignments, null, 2));
      
      // Delete existing BA assignments
      await supabase.deleteAllRows('personnel_ba_assign');
      
      // Insert new BA assignments
      const result = await supabase.insertRows('personnel_ba_assign', baAssignments);
      Logger.log('Successfully inserted BA assignments');
      return result;
    } else {
      Logger.log('No BA assignments to insert');
      return null;
    }
  } catch (error) {
    Logger.log('Error in BA assignments:', error.toString());
    throw error;
  }
}

// Update insertAllData to include BA assignments
async function insertAllData() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    Logger.log('Starting full data insert process...');
    
    // Run operations sequentially
    await Promise.all([
      (async () => {
        Logger.log('Starting personnel data insert...');
        await insertPersonnelData();
        Logger.log('Personnel data insert complete.');
      })(),
      (async () => {
        Logger.log('Starting daily statistics insert...');
        await insertDailyStatistics();
        Logger.log('Daily statistics insert complete.');
      })(),
      (async () => {
        Logger.log('Starting vehicle assignments insert...');
        await insertVehicleAssignments();
        Logger.log('Vehicle assignments insert complete.');
      })()
    ]);

    // Insert BA assignments after vehicle assignments are complete
    Logger.log('Starting BA assignments insert...');
    await insertBAAssignments();
    Logger.log('BA assignments insert complete.');

    Logger.log('All data inserted successfully!');
    ui.alert('Success', 'All data has been updated successfully!', ui.ButtonSet.OK);
    
  } catch (error) {
    Logger.log('Error in full data insert:', error.toString());
    ui.alert('Error', 'Failed to insert all data: ' + error.message, ui.ButtonSet.OK);
  }
}
