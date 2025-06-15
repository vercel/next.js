"use client";

// import VisualEditingComponent from "next-sanity/visual-editing/client-component";
import { VisualEditing as VisualEditingComponent } from "@sanity/visual-editing/react";
import { useEffect, useState } from "react";

export function VisualEditing() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setReady(true), 5_000);
    return () => clearTimeout(timeout);
  }, []);

  if (!ready) {
    return null;
  }

  return <VisualEditingComponent />;
}
