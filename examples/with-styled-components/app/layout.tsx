import { ReactNode } from "react";
import StyledComponentsRegistry from "@/lib/styled-components-registry";
import ClientLayout from "@/lib/client-layout";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StyledComponentsRegistry>
          <ClientLayout>{children}</ClientLayout>
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}
