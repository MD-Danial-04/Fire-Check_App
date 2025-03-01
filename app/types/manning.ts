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

export interface DailyStatistics {
  total_strength: number;
  total_ops_strength: number;
  current_duty_ops: number;
  leave_count: number;
  mc_count: number;
  course_count: number;
  ld_count: number;
  off_count: number;
  oa_count: number;
  MRV_count: number;
  RFV_count: number;
  LF811_count: number;
  LF812_count: number;
  leave_remarks?: string;
  mc_remarks?: string;
} 