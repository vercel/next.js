import * as React from "react"

import { cn } from "@/lib/utils"

interface ShellProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Shell({
  children,
  className,
  ...props
}: ShellProps) {
  return (
    <div
      className={cn("max-w-5xl mx-auto px-4 lg:px-8 ", className)}
      {...props}
    >
      {children}
    </div>
  )
}
