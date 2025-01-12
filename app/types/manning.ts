export interface Personnel {
  id: string;
  serial_no?: number;
  rank: string;
  name: string;
  role: string;
  status?: 'OVL' | 'VL' | 'DSC' | 'MC' | null;
  section?: string;
  position?: string;
}

export interface VehicleAssignment {
  id: string;
  vehicle_type: 'MRV811' | 'LF811' | 'LF812' | 'RFV811';
  section: string;
  position: string;
  personnel_id: string;
}

export interface DutyInfo {
  id: string;
  duty_section_commander: string;
  duty_date: string;
  created_at: string;
} 