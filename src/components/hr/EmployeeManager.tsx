import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Download, Trash2, QrCode as QrIcon } from "lucide-react";

interface Employee {
  id: string;
  employee_code: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  position: string | null;
}

export default function EmployeeManager() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [open, setOpen] = useState(false);
  const [qrEmp, setQrEmp] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ employee_code: "", full_name: "", email: "", phone: "", department: "", position: "" });

  async function load() {
    const { data, error } = await supabase.from("employees").select("*").order("created_at", { ascending: false });
    if (error) return toast.error(error.message);
    setEmployees(data as Employee[]);
  }
  useEffect(() => { load(); }, []);

  async function createEmployee(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const hr_id = userData.user?.id;
    if (!hr_id) return;
    const { data, error } = await supabase.from("employees").insert({
      hr_id,
      employee_code: form.employee_code.trim(),
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      department: form.department.trim() || null,
      position: form.position.trim() || null,
    }).select().single();
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Employee added");
    setOpen(false);
    setForm({ employee_code: "", full_name: "", email: "", phone: "", department: "", position: "" });
    await load();
    setQrEmp(data as Employee);
  }

  async function remove(id: string) {
    if (!confirm("Delete this employee and their attendance?")) return;
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Employees</h2>
          <p className="text-sm text-muted-foreground">{employees.length} total</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Add employee</span></Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>New Employee</DialogTitle></DialogHeader>
            <form onSubmit={createEmployee} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Employee code *</Label><Input required value={form.employee_code} onChange={e => setForm({ ...form, employee_code: e.target.value })} /></div>
                <div><Label>Full name *</Label><Input required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div>
              </div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Department</Label><Input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} /></div>
                <div><Label>Position</Label><Input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} /></div>
              </div>
              <DialogFooter><Button type="submit" disabled={loading}>{loading ? "…" : "Create & generate QR"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3">
        {employees.length === 0 && (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No employees yet. Add your first one.</CardContent></Card>
        )}
        {employees.map(emp => (
          <Card key={emp.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-secondary px-2 py-0.5 text-xs font-mono">{emp.employee_code}</span>
                  <p className="truncate font-semibold">{emp.full_name}</p>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {[emp.position, emp.department].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="outline" size="icon" onClick={() => setQrEmp(emp)}><QrIcon className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => remove(emp.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <QRDialog employee={qrEmp} onClose={() => setQrEmp(null)} />
    </div>
  );
}

function QRDialog({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    if (employee) {
      QRCode.toDataURL(employee.id, { width: 280, margin: 2, errorCorrectionLevel: "M" })
        .then((url) => { if (!cancelled) setDataUrl(url); })
        .catch((err) => { console.error("QR generation failed", err); toast.error("Failed to generate QR"); });
    } else {
      setDataUrl("");
    }
    return () => { cancelled = true; };
  }, [employee]);

  function download() {
    if (!dataUrl || !employee) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${employee.employee_code}-${employee.full_name}.png`;
    a.click();
  }

  return (
    <Dialog open={!!employee} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{employee?.full_name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-lg border bg-white p-3 min-h-[280px] min-w-[280px] flex items-center justify-center">
            {dataUrl ? (
              <img src={dataUrl} alt="Employee QR code" width={280} height={280} />
            ) : (
              <span className="text-xs text-muted-foreground">Generating…</span>
            )}
          </div>
          <p className="text-center text-xs text-muted-foreground">Code: <span className="font-mono">{employee?.employee_code}</span></p>
          <Button onClick={download} disabled={!dataUrl} className="w-full"><Download className="mr-2 h-4 w-4" />Download QR</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
