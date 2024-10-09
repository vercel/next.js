import { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main>
      <h2>Auth Layout</h2>
      {children}
    </main>
  );
}
