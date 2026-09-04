"use client";

import { ChakraProvider } from "@chakra-ui/react";
import { ThemeProvider } from "next-themes";
import theme from "../src/theme";

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <ChakraProvider value={theme}>
      <ThemeProvider attribute="class" disableTransitionOnChange>
        {props.children}
      </ThemeProvider>
    </ChakraProvider>
  );
}
