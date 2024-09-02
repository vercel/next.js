"use client";

import { TriangleAlertIcon, CheckIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@codecarrot/essentials";

function Variables() {
  const [vars] = useState({
    siteId: !!process.env.NEXT_PUBLIC_VOIDFULL_SITE_ID,
    token: !!process.env.NEXT_PUBLIC_VOIDFULL_CONTENT_TOKEN,
  });

  const missingVars = useMemo(() => {
    return Object.values(vars).filter((value) => !value).length;
  }, [vars]);

  return (
    <li className="text-pretty">
      <div className="relative pb-8">
        <span
          aria-hidden="true"
          className="absolute left-3.5 top-4 -ml-px h-full w-0.5 bg-gray-200"
        />
        <div className="relative flex space-x-3">
          <div>
            <span
              className={cn(
                missingVars > 0 ? "bg-amber-400" : "bg-green-600",
                "flex h-7 w-7 items-center justify-center rounded-full ring-6 ring-gray-50",
              )}
            >
              {missingVars > 0 ? (
                <TriangleAlertIcon
                  aria-hidden={true}
                  className="h-4 w-4 text-white"
                />
              ) : (
                <CheckIcon aria-hidden={true} className="h-4 w-4 text-white" />
              )}
            </span>
          </div>

          <div
            className={cn(
              "flex min-w-0 flex-1 justify-between space-x-4 pt-1.5",
            )}
          >
            <p>
              You need to add <code>NEXT_PUBLIC_VOIDFULL_CONTENT_TOKEN</code>
              {" and "}
              <code>NEXT_PUBLIC_VOIDFULL_SITE_ID</code> variables.
            </p>
          </div>
        </div>
      </div>
    </li>
  );
}

export function Checklist() {
  return (
    <ul className={cn("text-sm")}>
      <Variables />
    </ul>
  );
}
