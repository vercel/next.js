"use client";
import StyledComponentsRegistry from "../lib/registry";
import { ThemeProvider } from "styled-components";
import { StyleSheetManager } from "styled-components";
import stylisRTLPlugin from "stylis-plugin-rtl";

const theme = {
  colors: {
    primary: "#0070f3",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <StyledComponentsRegistry>
          <StyleSheetManager stylisPlugins={[stylisRTLPlugin]}>
            <ThemeProvider theme={theme}>{children}</ThemeProvider>
          </StyleSheetManager>
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}
