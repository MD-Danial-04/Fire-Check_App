import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Card } from "../ui/card";

interface Personnel {
  serial_no: number;
  rank: string;
  name: string;
  role: string;
  status: string;
  grouping: string;
}

interface PersonnelListProps {
  personnel: Personnel[];
}

const PersonnelList = ({ personnel }: PersonnelListProps) => {
  // Group personnel by their grouping
  const groupedPersonnel = personnel.reduce((acc, person) => {
    const group = person.grouping || 'Other';
    if (!acc[group]) {
      acc[group] = [];
    }
    acc[group].push(person);
    return acc;
  }, {} as Record<string, Personnel[]>);

  // Define the order of sections
  const sectionOrder = [
    'Rota Commander',
    'Deputy Rota Commander',
    'Marine Section Commander',
    'Marine Specialist',
    'Navigation Specialist',
    'Marine Firefighter',
    'Watchroom Operator',
    'Reservist / VES'
  ];

  // Sort the sections based on the defined order
  const sortedGroups = Object.entries(groupedPersonnel).sort(([a], [b]) => {
    const indexA = sectionOrder.indexOf(a);
    const indexB = sectionOrder.indexOf(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  return (
    <div className="space-y-6">
      {sortedGroups.map(([group, members]) => (
        <Card key={group} className="overflow-hidden">
          <div className="bg-gray-200 dark:bg-[#2E2521] px-4 py-2">
            <h3 className="font-semibold text-gray-900 dark:text-[#FCF6EC]">{group}</h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-100 dark:bg-[#1C1917]">
                <TableHead className="w-[80px] text-gray-900 dark:text-[#FCF6EC]">S/N</TableHead>
                <TableHead className="w-[200px] text-gray-900 dark:text-[#FCF6EC]">Rank</TableHead>
                <TableHead className="text-gray-900 dark:text-[#FCF6EC]">Name</TableHead>
                <TableHead className="w-[200px] text-gray-900 dark:text-[#FCF6EC]">Role</TableHead>
                <TableHead className="w-[120px] text-right text-gray-900 dark:text-[#FCF6EC]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((person) => (
                <TableRow key={person.serial_no}>
                  <TableCell className="font-medium">{person.serial_no}</TableCell>
                  <TableCell>{person.rank}</TableCell>
                  <TableCell>{person.name}</TableCell>
                  <TableCell>{person.role}</TableCell>
                  <TableCell className="text-right">{person.status || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ))}
    </div>
  );
};

export default PersonnelList; 