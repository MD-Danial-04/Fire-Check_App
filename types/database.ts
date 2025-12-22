export interface Database {
  public: {
    Tables: {
      personnel: {
        Row: Personnel
        Insert: Omit<Personnel, 'id'>
        Update: Partial<Omit<Personnel, 'id'>>
        Relationships: []
      }
      duty_sheets: {
        Row: DutySheet
        Insert: Omit<DutySheet, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<DutySheet, 'id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      manning_list: {
        Row: ManningList
        Insert: Omit<ManningList, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<ManningList, 'id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      vehicle_configs: {
        Row: VehicleConfig
        Insert: Omit<VehicleConfig, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<VehicleConfig, 'id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export interface Personnel {
  id: number
  duty_sheet_id: number
  rank: string
  name: string
  is_working: boolean
  vessel_backplate: string | null
  vessel_cylinder: string | null
  lfav_backplate: string | null
  lfav_cylinder: string | null
}

export interface DutySheet {
  id: number
  date: string
  created_at: string
  updated_at: string
}

export interface BaMasterList {
  id: number
  serial_number: string
  cylinder_serial: string
  location: string
  date_of_birth: string | null
  hydro_date: string | null
  service_due_date: string | null
  telemetry_id: string | null
  remarks: string | null
  created_at: string
  updated_at: string
  is_spare?: boolean
}

export interface ManningList {
  id: number
  duty_date: string
  duty_comment: string | null
  section: string | null
  position: string | null
  rank: string | null
  name: string | null
  status: string | null
  vessel: string | null
  created_at: string
  updated_at: string
}

export interface VehicleConfig {
  id: number
  name: string
  plate_number: string
  section: string
  created_at: string
  updated_at: string
}

export interface BaMovements {
  id: string
  ba_id: number
  from_location: string
  to_location: string
  movement_date: string
  movement_type: 'ASSIGNMENT' | 'RETURN' | 'TRANSFER' | 'SERVICE' | 'REPAIR'
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED'
  remarks: string | null
  created_by: string | null
  created_at: string
  updated_at: string
} 