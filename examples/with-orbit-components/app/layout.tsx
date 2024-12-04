"use client"
import { getTokens } from "@kiwicom/orbit-components";
import { ThemeProvider, createGlobalStyle } from "styled-components";
import "./globals.css"; // Import TailwindCSS globals

// Fetch Orbit tokens for consistent styling
const tokens = getTokens();

const GlobalStyle = createGlobalStyle`
body {
    width: 100vw;
    height: 100vh;
    margin: 0 auto;
    background-color: ${({ theme }) => theme.orbit.paletteCloudLight};
    }
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <title>My Orbit + Tailwind App</title>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <ThemeProvider theme={{ orbit: tokens }}>
          <GlobalStyle />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
