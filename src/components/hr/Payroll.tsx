import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { FileSpreadsheet, RefreshCw, Clock } from "lucide-react";

interface Punch { employee_id: string; punch_type: string; punched_at: string }
interface Emp { id: string; employee_code: string; full_name: string; department: string | null }
interface Summary { code: string; name: string; department: string; days: number; hours: number }

function monthRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: first.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

export default function Payroll() {
  const range = monthRange();
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [rows, setRows] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const start = new Date(from + "T00:00:00").toISOString();
    const end = new Date(to + "T23:59:59").toISOString();
    const [{ data: emps, error: e1 }, { data: punches, error: e2 }] = await Promise.all([
      supabase.from("employees").select("id, employee_code, full_name, department"),
      supabase.from("attendance").select("employee_id, punch_type, punched_at")
        .gte("punched_at", start).lte("punched_at", end).order("punched_at", { ascending: true }),
    ]);
    setLoading(false);
    if (e1 || e2) return toast.error((e1 ?? e2)!.message);

    const byEmp = new Map<string, Punch[]>();
    for (const p of (punches ?? []) as Punch[]) {
      const list = byEmp.get(p.employee_id) ?? [];
      list.push(p);
      byEmp.set(p.employee_id, list);
    }

    const out: Summary[] = [];
    for (const emp of (emps ?? []) as Emp[]) {
      const list = byEmp.get(emp.id) ?? [];
      let ms = 0;
      let openIn: Date | null = null;
      const days = new Set<string>();
      for (const p of list) {
        const at = new Date(p.punched_at);
        days.add(at.toDateString());
        if (p.punch_type === "in") openIn = at;
        else if (openIn) { ms += at.getTime() - openIn.getTime(); openIn = null; }
      }
      if (list.length === 0) continue;
      out.push({
        code: emp.employee_code,
        name: emp.full_name,
        department: emp.department ?? "",
        days: days.size,
        hours: Math.round((ms / 3600000) * 100) / 100,
      });
    }
    out.sort((a, b) => b.hours - a.hours);
    setRows(out);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  function exportExcel() {
    if (rows.length === 0) return toast.error("No payroll data to export");
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      "Employee Code": r.code, "Name": r.name, "Department": r.department,
      "Days Present": r.days, "Total Hours": r.hours,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payroll");
    XLSX.writeFile(wb, `payroll_${from}_to_${to}.xlsx`);
    toast.success("Excel downloaded");
  }

  const totalHours = Math.round(rows.reduce((s, r) => s + r.hours, 0) * 100) / 100;

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

      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary"><Clock className="h-5 w-5" /></div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Total hours worked</p>
            <p className="text-lg font-semibold">{totalHours} h across {rows.length} staff</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {rows.length === 0 && (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No worked hours in this range.</CardContent></Card>
        )}
        {rows.map(r => (
          <Card key={r.code + r.name}>
            <CardContent className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{r.name}</p>
                <p className="truncate text-xs text-muted-foreground"><span className="font-mono">{r.code}</span>{r.department ? ` · ${r.department}` : ""}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold">{r.hours} h</p>
                <p className="text-xs text-muted-foreground">{r.days} day{r.days === 1 ? "" : "s"}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground">Hours are counted from each punch in to the matching punch out.</p>
    </div>
  );
}
