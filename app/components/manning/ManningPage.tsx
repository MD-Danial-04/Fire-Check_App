import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ManningStatistics from "./ManningStatistics";
import { DailyStatistics } from "../../types/manning";

interface ManningPageProps {
  statistics: DailyStatistics;
}

const ManningPage = ({ statistics }: ManningPageProps) => {
  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-lg border">
          <h2 className="text-sm font-medium text-muted-foreground">Total Strength</h2>
          <p className="text-2xl font-bold">{statistics.total_strength}</p>
        </div>
        <div className="p-4 rounded-lg border">
          <h2 className="text-sm font-medium text-muted-foreground">Current Duty Ops</h2>
          <p className="text-2xl font-bold">{statistics.current_duty_ops}</p>
        </div>
        <div className="p-4 rounded-lg border">
          <h2 className="text-sm font-medium text-muted-foreground">On Leave</h2>
          <p className="text-2xl font-bold">{statistics.leave_count}</p>
        </div>
      </div>

      {/* Duty Info */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">Duty Section Commander</h2>
          <p className="text-lg font-semibold">SGT1 David</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <h2 className="text-sm font-medium text-muted-foreground">Duty Date</h2>
            <p className="text-lg font-semibold">Friday, 10/01/2025</p>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="ml-4">
                <span className="mr-2">📊</span>
                Detailed Statistics
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>Manning Statistics</DialogTitle>
              </DialogHeader>
              <ManningStatistics statistics={statistics} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Manning List Content */}
      <div className="mt-6">
        <h2 className="text-xl font-bold mb-4">Red Dolphin MRV811</h2>
        {/* Existing manning content */}
      </div>
    </div>
  );
};

export default ManningPage; 