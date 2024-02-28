import * as m from "@/paraglide/messages";
import { Navigation } from "./Navigation";

export function Header({ children }: { children: React.ReactNode }) {
  return (
    <header
      style={{
        padding: 24,
        fontFamily: "system-ui, sans-serif",
        display: "flex",
        justifyContent: "space-between",
        background: "white",
        borderBottom: "1px solid black",
      }}
    >
      <div style={{ display: "flex", gap: 8 }}>
        <b>{m.homepage_title()}</b>
        <Navigation />
      </div>
      <div style={{ display: "flex", gap: "4px" }}>{children}</div>
    </header>
  );
}
