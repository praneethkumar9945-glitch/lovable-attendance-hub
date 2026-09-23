import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { LogIn, LogOut, UserRound, CheckCircle2, Clock } from "lucide-react";
import { captureVideoFrame } from "@/lib/image";

interface Me { id: string; full_name: string; code: string; department: string | null; photo_url: string | null }
interface Row { id: string; punch_type: string; punched_at: string; snapshot_url: string | null }

export default function SelfPunch({ kind }: { kind: "employee" | "student" }) {
  const isEmp = kind === "employee";
  const table = isEmp ? "employees" : "students";
  const attTable = isEmp ? "attendance" : "student_attendance";
  const fk = isEmp ? "employee_id" : "student_id";
  const codeField = isEmp ? "employee_code" : "student_code";

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ type: string; at: string; snapshot: string | null } | null>(null);

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    const { data } = await supabase.from(table)
      .select(`id, full_name, department, photo_url, ${codeField}`).eq("user_id", uid).maybeSingle();
    if (!data) return;
    const r = data as Record<string, unknown>;
    const mine: Me = { id: r['id'] as string, full_name: r['full_name'] as string, code: (r[codeField] as string) ?? "", department: (r['department'] as string) ?? null, photo_url: (r['photo_url'] as string) ?? null };
    setMe(mine);
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const { data: att } = await supabase.from(attTable)
      .select("id, punch_type, punched_at, snapshot_url").eq(fk, mine.id)
      .gte("punched_at", startOfDay.toISOString()).order("punched_at", { ascending: false });
    setRows((att ?? []) as Row[]);
  }, [table, attTable, fk, codeField]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch { /* camera optional */ }
    })();
    return () => { cancelled = true; streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  useEffect(() => {
    if (!me) return;
    const channel = supabase.channel(`self-${me.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: attTable }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [me, attTable, load]);

  function speak(text: string) {
    try {
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    } catch { /* speech unavailable */ }
  }

  async function punch(type: "in" | "out") {
    if (!me) return;
    setBusy(true);
    const snapshot = captureVideoFrame(videoRef.current);
    const row: Record<string, unknown> = { punch_type: type, snapshot_url: snapshot };
    row[fk] = me.id;
    if (isEmp) {
      const { data: emp } = await supabase.from("employees").select("hr_id").eq("id", me.id).maybeSingle();
      row['hr_id'] = emp?.hr_id;
    }
    const { error } = await supabase.from(attTable).insert(row as never);
    setBusy(false);
    if (error) { toast.error(error.message); speak("Punch failed"); return; }
    const msg = `Punch ${type} successful for ${me.full_name}`;
    toast.success(msg);
    speak(msg);
    setResult({ type, at: new Date().toLocaleString(), snapshot });
    load();
  }

  let ms = 0, openIn: Date | null = null;
  for (const r of [...rows].reverse()) {
    const at = new Date(r.punched_at);
    if (r.punch_type === "in") openIn = at;
    else if (openIn) { ms += at.getTime() - openIn.getTime(); openIn = null; }
  }
  const hoursToday = Math.round((ms / 3600000) * 100) / 100;
  const lastType = rows[0]?.punch_type;

  if (!me) {
    return (
      <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
        Your record isn't linked yet. Ask HR to add you with this email address.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary">
            {me.photo_url ? <img src={me.photo_url} alt={me.full_name} className="h-full w-full object-cover" /> : <UserRound className="h-6 w-6 text-muted-foreground" />}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{me.full_name}</p>
            <p className="truncate text-xs text-muted-foreground"><span className="font-mono">{me.code}</span>{me.department ? ` · ${me.department}` : ""}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <video ref={videoRef} autoPlay playsInline muted className="mx-auto aspect-square w-full max-w-xs rounded-lg bg-black object-cover" />
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => punch("in")} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700"><LogIn className="mr-2 h-4 w-4" />Punch In</Button>
            <Button onClick={() => punch("out")} disabled={busy} variant="destructive"><LogOut className="mr-2 h-4 w-4" />Punch Out</Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            {lastType ? `Last action today: punch ${lastType}` : "No punches yet today"}
          </p>
        </CardContent>
      </Card>

      {result && (
        <Card className="border-emerald-500/50">
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <div className="min-w-0">
              <p className="font-semibold">Punch {result.type} successful</p>
              <p className="truncate text-xs text-muted-foreground">{result.at}</p>
            </div>
            {result.snapshot && <img src={result.snapshot} alt="Punch snapshot" className="ml-auto h-14 w-14 shrink-0 rounded-lg border object-cover" />}
          </CardContent>
        </Card>
      )}

      {isEmp && (
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary"><Clock className="h-5 w-5" /></div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Hours today</p>
              <p className="text-lg font-semibold">{hoursToday} h</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {rows.map(r => (
          <Card key={r.id}>
            <CardContent className="flex items-center gap-3 p-3">
              <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${r.punch_type === "in" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
                {r.punch_type === "in" ? <LogIn className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
              </div>
              <p className="flex-1 text-sm font-semibold uppercase">{r.punch_type}</p>
              {r.snapshot_url && <img src={r.snapshot_url} alt="Snapshot" className="h-9 w-9 rounded object-cover" />}
              <p className="text-xs text-muted-foreground">{new Date(r.punched_at).toLocaleTimeString()}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
