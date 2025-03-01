import { supabase } from './supabase'
import type { PostgrestSingleResponse, SupabaseClient } from '@supabase/supabase-js'
import type { BaMasterList, ManningList } from '@/types/database'

export const getDutySheet = async (date: string) => {
  try {
    // First get or create duty sheet
    const dutySheetResponse = await supabase
      .from('duty_sheets')
      .select('id')
      .eq('date', date)
      .maybeSingle()

    if (dutySheetResponse.error) {
      throw dutySheetResponse.error
    }

    const dutySheetId = dutySheetResponse.data?.id ?? (
      await supabase
        .from('duty_sheets')
        .insert([{ date }])
        .select('id')
        .single()
        .then(res => {
          if (res.error) throw res.error
          if (!res.data) throw new Error('Failed to create duty sheet')
          return res.data.id
        })
    )

    // Get personnel for this duty sheet
    const { data: personnel, error: personnelError } = await supabase
      .from('personnel')
      .select('*')
      .eq('duty_sheet_id', dutySheetId)
      .order('rank')

    if (personnelError) throw personnelError

    return { personnel: personnel || [] }
  } catch (error) {
    console.error('Error in getDutySheet:', error)
    throw error
  }
}

export const updatePersonnelStatus = async (id: number, is_working: boolean) => {
  try {
    const { error } = await supabase
      .from('personnel')
      .update({ is_working })
      .eq('id', id)

    if (error) {
      console.error('Supabase error:', error)
      throw new Error(`Failed to update status: ${error.message}`)
    }
  } catch (error) {
    console.error('Error in updatePersonnelStatus:', error)
    throw error
  }
}

export const getBAMasterList = async () => {
  try {
    const { data, error } = await supabase
      .from('ba_master_list')
      .select('*')
      .order('serial_number')

    if (error) {
      throw new Error(`Failed to fetch BA master list: ${error.message}`)
    }

    return data || []
  } catch (error) {
    console.error('Error in getBAMasterList:', error)
    throw error
  }
}

export const updateBAMasterList = async (id: number, updates: Partial<BaMasterList>) => {
  try {
    const { error } = await supabase
      .from('ba_master_list')
      .update(updates)
      .eq('id', id)

    if (error) {
      throw new Error(`Failed to update BA master list: ${error.message}`)
    }
  } catch (error) {
    console.error('Error in updateBAMasterList:', error)
    throw error
  }
}

export const getManningList = async (date: string) => {
  try {
    const { data, error } = await supabase
      .from('manning_list')
      .select('*')
      .eq('duty_date', date)
      .order('section')
      .order('position')

    if (error) {
      throw new Error(`Failed to fetch manning list: ${error.message}`)
    }

    return data || []
  } catch (error) {
    console.error('Error in getManningList:', error)
    throw error
  }
} 
export const getBAAssignments = async (supabase: SupabaseClient) => {
  const { data, error } = await supabase
    .from('personnel_ba_assignments')
    .select(`
      *,
      vehicle_assignments(*),
      ba_master_list(*)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching BA assignments:', error);
    return [];
  }

  return data;
}; 