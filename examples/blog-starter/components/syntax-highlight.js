import React from "react";
import theme from "prismjs/themes/prism.css";
// import theme from "prism-themes/themes/prism-a11y-dark.css";

export default () => (
  <>
    <style jsx global>
      {`
        ${theme}
        .mdx-marker {
          background-color: rgba(255, 255, 255, 0.5);
          display: block;
          margin-right: -1em;
          margin-left: -1em;
          padding-right: 1em;
          padding-left: 0.75em;
          border-left: 0.25em solid #dd4a68;
        }
      `}
    </style>
  </>
);
