import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Download, Trash2, QrCode as QrIcon, UserRound } from "lucide-react";
import { fileToDataUrl } from "@/lib/image";

export type PersonKind = "employee" | "student";

export interface Person {
  id: string;
  code: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  extra: string | null;
  photo_url: string | null;
}

const CFG = {
  employee: { table: "employees" as const, codeField: "employee_code", extraField: "position", codeLabel: "Employee code", extraLabel: "Position", title: "Employees" },
  student: { table: "students" as const, codeField: "student_code", extraField: "class_name", codeLabel: "Student code", extraLabel: "Class", title: "Students" },
};

export default function PersonManager({ kind, readOnly = false }: { kind: PersonKind; readOnly?: boolean }) {
  const cfg = CFG[kind];
  const [people, setPeople] = useState<Person[]>([]);
  const [open, setOpen] = useState(false);
  const [qrPerson, setQrPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(false);
  const [photo, setPhoto] = useState<string>("");
  const [form, setForm] = useState({ code: "", full_name: "", email: "", phone: "", department: "", extra: "" });

  async function load() {
    const { data, error } = await supabase.from(cfg.table).select("*").order("created_at", { ascending: false });
    if (error) return toast.error(error.message);
    setPeople(
      (data ?? []).map((r: Record<string, unknown>) => ({
        id: r['id'] as string,
        code: (r[cfg.codeField] as string) ?? "",
        full_name: r['full_name'] as string,
        email: (r['email'] as string) ?? null,
        phone: (r['phone'] as string) ?? null,
        department: (r['department'] as string) ?? null,
        extra: (r[cfg.extraField] as string) ?? null,
        photo_url: (r['photo_url'] as string) ?? null,
      })),
    );
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [kind]);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    try { setPhoto(await fileToDataUrl(file)); } catch { toast.error("Could not read that image"); }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const hr_id = userData.user?.id;
    if (!hr_id) { setLoading(false); return; }
    const payload: Record<string, unknown> = {
      hr_id,
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      department: form.department.trim() || null,
      photo_url: photo || null,
    };
    payload[cfg.codeField] = form.code.trim();
    payload[cfg.extraField] = form.extra.trim() || null;
    const { error } = await supabase.from(cfg.table).insert(payload as never);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(`${kind === "student" ? "Student" : "Employee"} added`);
    setOpen(false);
    setForm({ code: "", full_name: "", email: "", phone: "", department: "", extra: "" });
    setPhoto("");
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this person and their attendance?")) return;
    const { error } = await supabase.from(cfg.table).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{cfg.title}</h2>
          <p className="text-sm text-muted-foreground">{people.length} total</p>
        </div>
        {!readOnly && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Add {kind}</span></Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
              <DialogHeader><DialogTitle>New {kind === "student" ? "Student" : "Employee"}</DialogTitle></DialogHeader>
              <form onSubmit={create} className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary">
                    {photo ? <img src={photo} alt="Profile preview" className="h-full w-full object-cover" /> : <UserRound className="h-7 w-7 text-muted-foreground" />}
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Photo</Label>
                    <Input type="file" accept="image/*" onChange={(e) => pickPhoto(e.target.files?.[0])} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{cfg.codeLabel} *</Label><Input required value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></div>
                  <div><Label>Full name *</Label><Input required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div>
                </div>
                <div><Label>Email (used for their own login)</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Department</Label><Input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} /></div>
                  <div><Label>{cfg.extraLabel}</Label><Input value={form.extra} onChange={e => setForm({ ...form, extra: e.target.value })} /></div>
                </div>
                <DialogFooter><Button type="submit" disabled={loading}>{loading ? "…" : "Create"}</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid gap-3">
        {people.length === 0 && (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No {cfg.title.toLowerCase()} yet.</CardContent></Card>
        )}
        {people.map(p => (
          <Card key={p.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary">
                  {p.photo_url ? <img src={p.photo_url} alt={p.full_name} className="h-full w-full object-cover" /> : <UserRound className="h-5 w-5 text-muted-foreground" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-secondary px-2 py-0.5 font-mono text-xs">{p.code}</span>
                    <p className="truncate font-semibold">{p.full_name}</p>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{[p.extra, p.department].filter(Boolean).join(" · ") || "—"}</p>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="outline" size="icon" onClick={() => setQrPerson(p)}><QrIcon className="h-4 w-4" /></Button>
                {!readOnly && <Button variant="ghost" size="icon" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <QRDialog person={qrPerson} kind={kind} onClose={() => setQrPerson(null)} />
    </div>
  );
}

function QRDialog({ person, kind, onClose }: { person: Person | null; kind: PersonKind; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (person) {
      QRCode.toDataURL(`${kind}:${person.id}`, { width: 280, margin: 2, errorCorrectionLevel: "M" })
        .then((url) => { if (!cancelled) setDataUrl(url); })
        .catch(() => toast.error("Failed to generate QR"));
    } else setDataUrl("");
    return () => { cancelled = true; };
  }, [person, kind]);

  function download() {
    if (!dataUrl || !person) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${person.code}-${person.full_name}.png`;
    a.click();
  }

  return (
    <Dialog open={!!person} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{person?.full_name}</DialogTitle></DialogHeader>
        <div className="flex flex-col items-center gap-3">
          <div className="flex min-h-[280px] min-w-[280px] items-center justify-center rounded-lg border bg-white p-3">
            {dataUrl ? <img src={dataUrl} alt="QR code" width={280} height={280} /> : <span className="text-xs text-muted-foreground">Generating…</span>}
          </div>
          <p className="text-center text-xs text-muted-foreground">Code: <span className="font-mono">{person?.code}</span></p>
          <Button onClick={download} disabled={!dataUrl} className="w-full"><Download className="mr-2 h-4 w-4" />Download QR</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
