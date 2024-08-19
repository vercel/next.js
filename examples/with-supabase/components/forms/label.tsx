import React from "react";

export function Label({
  children,
  ...props
}: { children: React.ReactNode } & React.JSX.IntrinsicElements["label"]) {
  return (
    <label className="text-sm font-medium" {...props}>
      {children}
    </label>
  );
}
