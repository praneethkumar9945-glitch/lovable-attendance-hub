import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { FileSpreadsheet, RefreshCw, LogIn, LogOut } from "lucide-react";

interface Row {
  id: string;
  punch_type: "in" | "out";
  punched_at: string;
  employees: { employee_code: string; full_name: string; department: string | null } | null;
}

export default function AttendanceList() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const start = new Date(from + "T00:00:00").toISOString();
    const end = new Date(to + "T23:59:59").toISOString();
    const { data, error } = await supabase
      .from("attendance")
      .select("id, punch_type, punched_at, employees(employee_code, full_name, department)")
      .gte("punched_at", start).lte("punched_at", end)
      .order("punched_at", { ascending: false });
    setLoading(false);
    if (error) return toast.error(error.message);
    setRows(data as unknown as Row[]);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  function exportExcel() {
    if (rows.length === 0) return toast.error("No data to export");
    const data = rows.map(r => ({
      "Employee Code": r.employees?.employee_code ?? "",
      "Name": r.employees?.full_name ?? "",
      "Department": r.employees?.department ?? "",
      "Punch": r.punch_type === "in" ? "IN" : "OUT",
      "Date": new Date(r.punched_at).toLocaleDateString(),
      "Time": new Date(r.punched_at).toLocaleTimeString(),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, `attendance_${from}_to_${to}.xlsx`);
    toast.success("Excel downloaded");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <Button variant="outline" onClick={load} disabled={loading} className="sm:mt-5"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
          <Button onClick={exportExcel} className="sm:mt-5"><FileSpreadsheet className="mr-2 h-4 w-4" />Export Excel</Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {rows.length === 0 && (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No attendance records in this range.</CardContent></Card>
        )}
        {rows.map(r => (
          <Card key={r.id}>
            <CardContent className="flex items-center gap-3 p-3">
              <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${r.punch_type === "in" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
                {r.punch_type === "in" ? <LogIn className="h-5 w-5" /> : <LogOut className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{r.employees?.full_name ?? "—"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="font-mono">{r.employees?.employee_code}</span>
                  {r.employees?.department ? ` · ${r.employees.department}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-semibold uppercase">{r.punch_type}</p>
                <p className="text-xs text-muted-foreground">{new Date(r.punched_at).toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
