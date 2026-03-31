import Header from "./Header";
import type { PropsWithChildren } from "react";

export default function Page({ children }: PropsWithChildren<{}>) {
  return (
    <div>
      <Header />
      {children}
    </div>
  );
}
