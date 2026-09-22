import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Camera, StopCircle, LogIn, LogOut, UserRound, CheckCircle2 } from "lucide-react";
import { captureVideoFrame } from "@/lib/image";
import type { PersonKind } from "./PersonManager";

interface P { id: string; full_name: string; code: string; photo_url: string | null }

const CFG = {
  employee: { table: "employees" as const, codeField: "employee_code", att: "attendance" as const, fk: "employee_id" },
  student: { table: "students" as const, codeField: "student_code", att: "student_attendance" as const, fk: "student_id" },
};

export default function AttendanceScanner() {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "qr-scanner-region";
  const [scanning, setScanning] = useState(false);
  const [kind, setKind] = useState<PersonKind>("employee");
  const [people, setPeople] = useState<P[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ person: P; type: "in" | "out"; snapshot: string | null; at: string } | null>(null);
  const cooldownRef = useRef<string | null>(null);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [kind]);
  useEffect(() => () => { stop(); }, []);

  async function load() {
    const cfg = CFG[kind];
    const { data } = await supabase.from(cfg.table).select(`id, full_name, photo_url, ${cfg.codeField}`).order("full_name");
    setSelectedId("");
    setPeople(((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r['id'] as string,
      full_name: r['full_name'] as string,
      code: (r[cfg.codeField] as string) ?? "",
      photo_url: (r['photo_url'] as string) ?? null,
    })));
  }

  function videoEl() {
    return document.querySelector(`#${containerId} video`) as HTMLVideoElement | null;
  }

  async function start() {
    try {
      const html5 = new Html5Qrcode(containerId);
      scannerRef.current = html5;
      await html5.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decoded) => {
          if (cooldownRef.current === decoded) return;
          cooldownRef.current = decoded;
          setTimeout(() => { if (cooldownRef.current === decoded) cooldownRef.current = null; }, 4000);
          await handleScan(decoded);
        },
        () => {},
      );
      setScanning(true);
    } catch (e: unknown) {
      toast.error("Camera error: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function stop() {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch { /* already stopped */ }
    setScanning(false);
  }

  function speak(text: string) {
    try {
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    } catch { /* speech unavailable */ }
  }

  async function punch(person: P, personKind: PersonKind, punch_type: "in" | "out", snapshot: string | null) {
    const cfg = CFG[personKind];
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user!.id;
    const row: Record<string, unknown> = { punch_type, snapshot_url: snapshot };
    row[cfg.fk] = person.id;
    if (personKind === "employee") row['hr_id'] = uid; else row['recorded_by'] = uid;
    const { error } = await supabase.from(cfg.att).insert(row as never);
    if (error) { toast.error(error.message); speak("Punch failed"); return; }
    const msg = `${punch_type === "in" ? "Punch in" : "Punch out"} successful for ${person.full_name}`;
    toast.success(msg);
    speak(msg);
    setResult({ person, type: punch_type, snapshot, at: new Date().toLocaleString() });
  }

  async function handleScan(decoded: string) {
    setProcessing(true);
    const [prefix, rest] = decoded.includes(":") ? decoded.split(":") : ["employee", decoded];
    const personKind: PersonKind = prefix === "student" ? "student" : "employee";
    const id = rest ?? "";
    const cfg = CFG[personKind];
    const { data, error } = await supabase.from(cfg.table)
      .select(`id, full_name, photo_url, ${cfg.codeField}`).eq("id", id).maybeSingle();
    if (error || !data) { toast.error("Unknown QR code"); speak("Invalid QR code"); setProcessing(false); return; }
    const rec = data as Record<string, unknown>;
    const person: P = { id: rec['id'] as string, full_name: rec['full_name'] as string, code: (rec[cfg.codeField] as string) ?? "", photo_url: (rec['photo_url'] as string) ?? null };
    const snapshot = captureVideoFrame(videoEl());
    await punch(person, personKind, await nextType(personKind, person.id), snapshot);
    setProcessing(false);
  }

  async function nextType(personKind: PersonKind, personId: string): Promise<"in" | "out"> {
    const cfg = CFG[personKind];
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const { data } = await supabase.from(cfg.att).select("punch_type")
      .eq(cfg.fk, personId).gte("punched_at", startOfDay.toISOString())
      .order("punched_at", { ascending: false }).limit(1).maybeSingle();
    return data?.punch_type === "in" ? "out" : "in";
  }

  async function manualPunch(type: "in" | "out") {
    const person = people.find((p) => p.id === selectedId);
    if (!person) { toast.error("Select someone first"); return; }
    setProcessing(true);
    await punch(person, kind, type, captureVideoFrame(videoEl()));
    setProcessing(false);
  }

  return (
    <div className="space-y-4">
      <Tabs value={kind} onValueChange={(v) => setKind(v as PersonKind)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="employee">Staff</TabsTrigger>
          <TabsTrigger value="student">Students</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-4">
          <div id={containerId} className="mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-lg bg-black" />
          <div className="mt-3 flex gap-2">
            {!scanning ? (
              <Button onClick={start} className="flex-1"><Camera className="mr-2 h-4 w-4" />Start scanner</Button>
            ) : (
              <Button onClick={stop} variant="destructive" className="flex-1"><StopCircle className="mr-2 h-4 w-4" />Stop</Button>
            )}
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">Scan any staff or student QR code — a live photo is captured with each punch.</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase text-muted-foreground">Manual punch</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger><SelectValue placeholder={kind === "student" ? "Select student" : "Select staff member"} /></SelectTrigger>
              <SelectContent>
                {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name} ({p.code})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => manualPunch("in")} disabled={processing} className="bg-emerald-600 hover:bg-emerald-700"><LogIn className="mr-2 h-4 w-4" />Punch In</Button>
            <Button onClick={() => manualPunch("out")} disabled={processing} variant="destructive"><LogOut className="mr-2 h-4 w-4" />Punch Out</Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">Both Punch In and Punch Out can be recorded for the same person on the same day.</p>
        </CardContent>
      </Card>

      {result && (
        <Card className="border-emerald-500/50">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
              <p className="font-semibold">Punch {result.type === "in" ? "in" : "out"} successful</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary">
                {result.person.photo_url
                  ? <img src={result.person.photo_url} alt={result.person.full_name} className="h-full w-full object-cover" />
                  : <UserRound className="h-7 w-7 text-muted-foreground" />}
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{result.person.full_name}</p>
                <p className="truncate text-xs text-muted-foreground"><span className="font-mono">{result.person.code}</span> · {result.at}</p>
              </div>
              {result.snapshot && (
                <img src={result.snapshot} alt="Punch snapshot" className="ml-auto h-16 w-16 shrink-0 rounded-lg border object-cover" />
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
