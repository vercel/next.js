import { ReactNode } from "react";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <main>
      <h2>Dashboard Layout</h2>
      {children}
    </main>
  );
}
