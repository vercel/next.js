import { cn } from "@codecarrot/essentials";

import { Checklist } from "./Checklist";
import { ReferenceLinks } from "./ReferenceLinks";

export function Root() {
  return (
    <div className={cn("border border-gray-300 rounded-lg", "bg-gray-50")}>
      <div className={cn("px-4 pt-2", "text-xs text-gray-500 text-right")}>
        This is welcome guide from Voidfull.
      </div>

      <div
        className={cn(
          "grid md:grid-cols-2 md:gap-x-12",
          "divide-x divide-gray-300",
          "p-8",
        )}
      >
        <Checklist />
        <ReferenceLinks />
      </div>
    </div>
  );
}
