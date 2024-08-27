"use client";

import { useState } from "react";
import { Button } from "../ui/button";
import { Check, Copy } from "lucide-react";

export default function Code({ code }: { code: string }) {
  const [icon, setIcon] = useState(<Copy />);

  const copy = async () => {
    await navigator?.clipboard?.writeText(code);
    setIcon(<Check />);
    setTimeout(() => setIcon(<Copy />), 2000);
  };

  return (
    <pre className="bg-foreground/5 rounded-md p-8 my-8 relative">
      <Button size="icon" onClick={copy} variant={"outline"}>
        {icon}
      </Button>
      <code>{code}</code>
    </pre>
  );
}
