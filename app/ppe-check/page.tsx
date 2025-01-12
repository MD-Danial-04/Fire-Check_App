'use client'

import { createBrowserClient } from '@supabase/ssr'
import { useEffect, useState } from 'react'

interface Personnel {
  id: string;
  personnel_name: string;
  vehicle_type: string;
  section: string;
  position: string;
  vessel_backplate: string | null;
  vessel_cylinder: string | null;
  lfav_backplate: string | null;
  lfav_cylinder: string | null;
}

export default function PPECheck() {
  const [personnel, setPersonnel] = useState<Personnel[]>([]);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    async function fetchData() {
      const { data, error } = await supabase
        .from('personnel_ba_view')
        .select('*')
        .order('section')
        .order('position');

      if (error) console.error('Error:', error);
      if (data) setPersonnel(data);
    }

    fetchData();
  }, [supabase]);

  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Vehicle</th>
          <th>Section</th>
          <th>Position</th>
          <th>Vessel Backplate</th>
          <th>Vessel Cylinder</th>
          <th>LFAV Backplate</th>
          <th>LFAV Cylinder</th>
        </tr>
      </thead>
      <tbody>
        {personnel.map((person) => (
          <tr key={person.id}>
            <td>{person.personnel_name}</td>
            <td>{person.vehicle_type}</td>
            <td>{person.section}</td>
            <td>{person.position}</td>
            <td>{person.vessel_backplate || '-'}</td>
            <td>{person.vessel_cylinder || '-'}</td>
            <td>{person.lfav_backplate || '-'}</td>
            <td>{person.lfav_cylinder || '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
} 