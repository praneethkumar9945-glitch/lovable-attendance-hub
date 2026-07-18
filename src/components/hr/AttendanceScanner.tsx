import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Camera, StopCircle, LogIn, LogOut } from "lucide-react";

interface Employee { id: string; full_name: string; employee_code: string }

export default function AttendanceScanner() {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "qr-scanner-region";
  const [scanning, setScanning] = useState(false);
  const [lastEmp, setLastEmp] = useState<Employee | null>(null);
  const [processing, setProcessing] = useState(false);
  const cooldownRef = useRef<string | null>(null);

  useEffect(() => () => { stop(); }, []);

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
    } catch (e: any) {
      toast.error("Camera error: " + (e?.message ?? e));
    }
  }

  async function stop() {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch {}
    setScanning(false);
  }

  function speak(text: string) {
    try {
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1; u.pitch = 1; u.volume = 1;
      window.speechSynthesis.speak(u);
    } catch {}
  }

  async function handleScan(employeeId: string) {
    setProcessing(true);
    const { data: emp, error } = await supabase.from("employees").select("id,full_name,employee_code").eq("id", employeeId).maybeSingle();
    if (error || !emp) { toast.error("Unknown QR code"); speak("Invalid QR code"); setProcessing(false); return; }
    // Determine punch type by last record today
    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
    const { data: last } = await supabase.from("attendance")
      .select("punch_type").eq("employee_id", emp.id)
      .gte("punched_at", startOfDay.toISOString())
      .order("punched_at", { ascending: false }).limit(1).maybeSingle();
    const punch_type: "in" | "out" = last?.punch_type === "in" ? "out" : "in";
    const { data: userData } = await supabase.auth.getUser();
    const hr_id = userData.user!.id;
    const { error: insErr } = await supabase.from("attendance").insert({ employee_id: emp.id, hr_id, punch_type });
    if (insErr) { toast.error(insErr.message); setProcessing(false); return; }
    setLastEmp(emp);
    const msg = `${punch_type === "in" ? "Punch in" : "Punch out"} confirmed for ${emp.full_name}`;
    toast.success(msg);
    speak(msg);
    setProcessing(false);
  }

  async function manualPunch(type: "in" | "out") {
    if (!lastEmp) return;
    const { data: userData } = await supabase.auth.getUser();
    const hr_id = userData.user!.id;
    const { error } = await supabase.from("attendance").insert({ employee_id: lastEmp.id, hr_id, punch_type: type });
    if (error) return toast.error(error.message);
    const msg = `${type === "in" ? "Punch in" : "Punch out"} confirmed for ${lastEmp.full_name}`;
    toast.success(msg);
    speak(msg);
  }

  return (
    <div className="space-y-4">
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
          <p className="mt-2 text-center text-xs text-muted-foreground">Point the camera at an employee's QR code. Voice will confirm each punch.</p>
        </CardContent>
      </Card>

      {lastEmp && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Last scanned</p>
            <p className="text-lg font-semibold">{lastEmp.full_name}</p>
            <p className="text-xs text-muted-foreground">Code: <span className="font-mono">{lastEmp.employee_code}</span></p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => manualPunch("in")} disabled={processing}><LogIn className="mr-2 h-4 w-4" />Punch in</Button>
              <Button variant="outline" onClick={() => manualPunch("out")} disabled={processing}><LogOut className="mr-2 h-4 w-4" />Punch out</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
