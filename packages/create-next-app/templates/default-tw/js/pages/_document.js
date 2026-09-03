import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en" className="h-full">
      <Head />
      <body className="min-h-full flex flex-col antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
