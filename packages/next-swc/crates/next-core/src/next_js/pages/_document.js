// The full definition of the default _document.js file is in
// https://github.com/vercel/next.js/blob/canary/packages/next/pages/_document.tsx

import React from "react";
import { HtmlContext } from "@vercel/turbopack-next/internal/html-context";

export function Html(props) {
  return <html {...props} />;
}

export function Head({ children, ...props }) {
  const { styles, scripts } = React.useContext(HtmlContext);

  return (
    <head {...props}>
      {children}
      {styles.map((url) => (
        <link key={url} href={url} rel="stylesheet" />
      ))}
      {scripts.map((url) => (
        <link key={url} type="preload" href={url} as="script" />
      ))}
    </head>
  );
}

// This utility is based on https://github.com/zertosh/htmlescape
// License: https://github.com/zertosh/htmlescape/blob/0527ca7156a524d256101bb310a9f970f63078ad/LICENSE

const ESCAPE_LOOKUP = {
  "&": "\\u0026",
  ">": "\\u003e",
  "<": "\\u003c",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

const ESCAPE_REGEX = /[&><\u2028\u2029]/g;

export function htmlEscapeJsonString(str) {
  return str.replace(ESCAPE_REGEX, (match) => ESCAPE_LOOKUP[match]);
}

export function NextScript() {
  const { scripts, __NEXT_DATA__ } = React.useContext(HtmlContext);

  return (
    <>
      <script
        id="__NEXT_DATA__"
        type="application/json"
        dangerouslySetInnerHTML={{
          __html: htmlEscapeJsonString(JSON.stringify(__NEXT_DATA__)),
        }}
      ></script>
      {scripts.map((url) => (
        <script key={url} src={url} type="text/javascript"></script>
      ))}
    </>
  );
}

export function Main() {
  // This element will be search-and-replaced with the actual page content once
  // rendered to static markup.
  return <next-js-internal-body-render-target />;
}

export default function Document() {
  return (
    <Html>
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
