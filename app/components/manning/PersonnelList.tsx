import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Card } from "../ui/card";
import { cn } from "@/lib/utils";

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
          <div className="bg-muted px-4 py-3 border-b border-border">
            <h3 className="font-semibold">{group}</h3>
          </div>
          <div className="overflow-x-auto">
            <Table className="w-full table-fixed">
              <TableHeader>
                <TableRow className="border-b border-border">
                  <TableHead className="w-[80px] md:w-[120px] py-3 pl-4 font-medium">Rank</TableHead>
                  <TableHead className="py-3 font-medium">Name</TableHead>
                  <TableHead className="w-[100px] py-3 pr-4 text-right font-medium">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((person) => (
                  <TableRow key={person.serial_no} className="border-b border-border last:border-0">
                    <TableCell className="py-3 pl-4 w-[80px] md:w-[120px]">{person.rank}</TableCell>
                    <TableCell className="py-3">{person.name}</TableCell>
                    <TableCell className="py-3 pr-4 text-right w-[100px]">
                      <span className="whitespace-nowrap">
                        {person.status || '-'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default PersonnelList; 