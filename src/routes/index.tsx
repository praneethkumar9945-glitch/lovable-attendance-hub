import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [state, setState] = useState<"loading" | "in" | "out">("loading");
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setState(data.session ? "in" : "out");
    });
  }, []);
  if (state === "loading") {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="text-muted-foreground">Loading…</div></div>;
  }
  return <Navigate to={state === "in" ? "/dashboard" : "/auth"} replace />;
}
