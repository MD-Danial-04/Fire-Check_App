import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  id: number;
  name: string;
  checked: boolean;
  assignedTo?: string;
  status?: string;
  identifier?: string;
}

interface ChecklistSection {
  title: string;
  items: ChecklistItem[];
}

export function EquipmentChecklist() {
  const [sections, setSections] = useState<ChecklistSection[]>([
    {
      title: "ARMOURY",
      items: [
        { id: 1, name: "LF811", checked: false },
        { id: 2, name: "LF812", checked: false },
        { id: 3, name: "RFV811", checked: false },
        { id: 4, name: "MRV811", checked: false },
        { id: 5, name: "MRV EMT Bag 1", checked: false },
        { id: 6, name: "MRV EMT Bag 2", checked: false },
      ]
    },
    {
      title: "VEHICLE FPT",
      items: [
        { id: 1, name: "CFS FRC(QX1859E)", checked: false },
        { id: 2, name: "Class 4 Truck (YN4304C)", checked: false },
        { id: 3, name: "LF811 (GDB7755P)", checked: false },
        { id: 4, name: "LF812 (GBD6351C)", checked: false },
        { id: 5, name: "Admin FRC (QX1034T)", checked: true, assignedTo: "SGT3 Hafidz", status: "Full", identifier: "67cf8a106c77bb89d06899d1" },
        { id: 6, name: "Spare LF (GBF8661J)", checked: false },
      ]
    },
    {
      title: "VEHICLE LPT",
      items: [
        { id: 1, name: "CFS FRC(QX1859E)", checked: false },
        { id: 2, name: "Class 4 Truck (YN4304C)", checked: false },
        { id: 3, name: "LF811 (GBF8661J)", checked: false },
        { id: 4, name: "LF812 (GBD6351C)", checked: false },
        { id: 5, name: "Admin FRC (QX1034T)", checked: false },
        { id: 6, name: "Spare LF (GBD7755P)", checked: false },
      ]
    },
    {
      title: "BWC",
      items: [
        { id: 1, name: "G0247 8417", checked: false },
        { id: 2, name: "G0247 8421", checked: false },
        { id: 3, name: "G0247 8448", checked: false },
        { id: 4, name: "G0247 8450", checked: false },
        { id: 5, name: "G0247 8454", checked: true, assignedTo: "SGT3 Kamaruzaman" },
        { id: 6, name: "G0453 8776", checked: false },
        { id: 7, name: "F9144 1494", checked: true, assignedTo: "LTA Eddie" },
        { id: 8, name: "F9144 1507", checked: false },
        { id: 9, name: "F9251 5515", checked: false },
      ]
    }
  ]);

  const handleCheckChange = (sectionIndex: number, itemIndex: number, checked: boolean) => {
    const newSections = [...sections];
    newSections[sectionIndex].items[itemIndex].checked = checked;
    setSections(newSections);
  };

  return (
    <div className="space-y-6">
      {sections.map((section, sectionIndex) => (
        <Card key={section.title} className="overflow-hidden">
          <CardHeader className="px-4 md:px-6 py-3 md:py-4 bg-red-600 text-white">
            <CardTitle className="text-lg">{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="w-16 px-4 py-3 text-left text-sm font-medium text-muted-foreground">#</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Item</th>
                    <th className="w-24 px-4 py-3 text-center text-sm font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Assigned To</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Identifier</th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item, itemIndex) => (
                    <tr 
                      key={item.id} 
                      className={cn(
                        "border-b border-muted/30 last:border-0",
                        item.checked ? "bg-muted/20" : ""
                      )}
                    >
                      <td className="px-4 py-3 text-sm">{item.id}</td>
                      <td className="px-4 py-3 text-sm font-medium">{item.name}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center">
                          <Checkbox 
                            id={`${section.title}-${item.id}`}
                            checked={item.checked}
                            onCheckedChange={(checked) => 
                              handleCheckChange(sectionIndex, itemIndex, checked as boolean)
                            }
                            aria-label={`Mark ${item.name} as checked`}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">{item.assignedTo || ""}</td>
                      <td className="px-4 py-3 text-sm">{item.status || ""}</td>
                      <td className="px-4 py-3 font-mono text-xs">{item.identifier || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
} 