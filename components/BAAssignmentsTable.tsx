import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr'

type BAAssignment = {
  id: string;
  personnel_id: string;
  ba_id: number;
  assignment_date: string;
  return_date: string | null;
  status: 'Active' | 'Returned';
  created_at: string;
  vehicle_assignments: {
    id: string;
    // Add other fields as needed
  };
  ba_master_list: {
    id: number;
    // Add other fields as needed
  };
};

const BAAssignmentsTable = () => {
  const [assignments, setAssignments] = useState<BAAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const loadAssignments = async () => {
      const { data, error } = await supabase
        .from('ba_assignments')
        .select(`
          *,
          vehicle_assignments (*),
          ba_master_list (*)
        `)
        .order('assignment_date', { ascending: false });

      if (data) {
        setAssignments(data);
      }
      setLoading(false);
    };

    loadAssignments();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Personnel
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              BA ID
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Assignment Date
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Return Date
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {assignments.map((assignment) => (
            <tr key={assignment.id}>
              <td className="px-6 py-4 whitespace-nowrap">
                {assignment.vehicle_assignments?.id}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {assignment.ba_id}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {new Date(assignment.assignment_date).toLocaleDateString()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {assignment.return_date
                  ? new Date(assignment.return_date).toLocaleDateString()
                  : '-'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span
                  className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    assignment.status === 'Active'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {assignment.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default BAAssignmentsTable; 