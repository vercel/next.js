import { createElement } from "react";
import { setup } from "goober";
import { prefix } from "goober/prefixer";
import { extractCss } from "goober";

// goober's needs to know how to render the `styled` nodes.
// So to let it know, we run the `setup` function with the
// `createElement` function and prefixer function.
setup(createElement, prefix);

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const css = extractCss();

  return (
    <html lang="en">
      <head>
        <style id={"_goober"} dangerouslySetInnerHTML={{ __html: " " + css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
