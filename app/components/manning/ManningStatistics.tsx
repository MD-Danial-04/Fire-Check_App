import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "../../components/ui/table";
import { DailyStatistics } from "../../types/manning";

interface ManningStatisticsProps {
  statistics: DailyStatistics;
}

const ManningStatistics = ({ statistics }: ManningStatisticsProps) => {
  const strengthStats = [
    { label: "Total Strength", value: statistics.total_strength },
    { label: "Total Ops Strength", value: statistics.total_ops_strength },
    { label: "Current Duty Ops", value: statistics.current_duty_ops },
  ];

  const personnelStatus = [
    { label: "Leave", value: statistics.leave_count },
    { label: "MC/HL", value: statistics.mc_count },
    { label: "Course", value: statistics.course_count },
    { label: "LD", value: statistics.ld_count },
    { label: "OH", value: statistics.off_count },
    { label: "OA", value: statistics.oa_count },
  ];

  const vehicleManpower = [
    { label: "MRV811", value: statistics.MRV_count },
    { label: "RFV811", value: statistics.RFV_count },
    { label: "LFAV811", value: statistics.LF811_count },
    { label: "LFAV812", value: statistics.LF812_count },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* Strength Statistics */}
      <Card>
        <CardHeader className="pb-2">
          <h3 className="font-semibold text-lg">Strength Overview</h3>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              {strengthStats.map((stat) => (
                <TableRow key={stat.label}>
                  <TableCell className="font-medium">{stat.label}</TableCell>
                  <TableCell className="text-right">{stat.value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Personnel Status */}
      <Card>
        <CardHeader className="pb-2">
          <h3 className="font-semibold text-lg">Personnel Status</h3>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              {personnelStatus.map((stat) => (
                <TableRow key={stat.label}>
                  <TableCell className="font-medium">{stat.label}</TableCell>
                  <TableCell className="text-right">{stat.value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Vehicle Manning */}
      <Card>
        <CardHeader className="pb-2">
          <h3 className="font-semibold text-lg">Vehicle Manning</h3>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              {vehicleManpower.map((stat) => (
                <TableRow key={stat.label}>
                  <TableCell className="font-medium">{stat.label}</TableCell>
                  <TableCell className="text-right">{stat.value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Remarks Section */}
      {(statistics.leave_remarks || statistics.mc_remarks) && (
        <Card className="md:col-span-2 lg:col-span-3">
          <CardHeader className="pb-2">
            <h3 className="font-semibold text-lg">Remarks</h3>
          </CardHeader>
          <CardContent className="space-y-4">
            {statistics.leave_remarks && (
              <div>
                <h4 className="font-medium mb-1">Leave Remarks:</h4>
                <p className="text-sm text-muted-foreground">{statistics.leave_remarks}</p>
              </div>
            )}
            {statistics.mc_remarks && (
              <div>
                <h4 className="font-medium mb-1">MC Remarks:</h4>
                <p className="text-sm text-muted-foreground">{statistics.mc_remarks}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ManningStatistics; 