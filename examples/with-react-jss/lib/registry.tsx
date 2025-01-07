"use client";

import { useState, useEffect } from "react";
import { SheetsRegistry, JssProvider, createGenerateId } from "react-jss";

export default function StyledJsxRegistry({
  children,
}: {
  children: React.ReactNode;
}) {
  const [registry] = useState(() => new SheetsRegistry());
  const generateId = createGenerateId();

  useEffect(() => {
    const style = document.getElementById("server-side-styles");
    if (style && style.parentNode) {
      style.parentNode.removeChild(style);
    }
  }, []);

  return (
    <JssProvider registry={registry} generateId={generateId}>
      {children}
      <style id="server-side-styles">{registry.toString()}</style>
    </JssProvider>
  );
}
