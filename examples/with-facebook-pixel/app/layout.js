import { FacebookPixel } from "./components";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <FacebookPixel />
      </body>
    </html>
  );
}
