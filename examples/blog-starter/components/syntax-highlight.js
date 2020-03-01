import React from 'react'

export default () => (
  <style jsx global>
    {`
      code[class*='language-'],
      pre[class*='language-'] {
        color: #f8f8f2;
        background: none;
        font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace;
        text-align: left;
        white-space: pre;
        word-spacing: normal;
        word-break: normal;
        word-wrap: normal;
        line-height: 1.5;

        -moz-tab-size: 4;
        -o-tab-size: 4;
        tab-size: 4;

        -webkit-hyphens: none;
        -moz-hyphens: none;
        -ms-hyphens: none;
        hyphens: none;
      }

      pre[class*='language-'] {
        padding: 1em;
        margin: 0.5em 0;
        overflow: auto;
        border-radius: 0.3em;
      }

      :not(pre) > code[class*='language-'],
      pre[class*='language-'] {
        background: #2b2b2b;
      }

      :not(pre) > code[class*='language-'] {
        padding: 0.1em;
        border-radius: 0.3em;
        white-space: normal;
      }

      .token.comment,
      .token.prolog,
      .token.doctype,
      .token.cdata {
        color: #d4d0ab;
      }

      .token.punctuation {
        color: #fefefe;
      }

      .token.property,
      .token.tag,
      .token.constant,
      .token.symbol,
      .token.deleted {
        color: #ffa07a;
      }

      .token.boolean,
      .token.number {
        color: #00e0e0;
      }

      .token.selector,
      .token.attr-name,
      .token.string,
      .token.char,
      .token.builtin,
      .token.inserted {
        color: #abe338;
      }

      .token.operator,
      .token.entity,
      .token.url,
      .language-css .token.string,
      .style .token.string,
      .token.variable {
        color: #00e0e0;
      }

      .token.atrule,
      .token.attr-value,
      .token.function {
        color: #ffd700;
      }

      .token.keyword {
        color: #00e0e0;
      }

      .token.regex,
      .token.important {
        color: #ffd700;
      }

      .token.important,
      .token.bold {
        font-weight: bold;
      }
      .token.italic {
        font-style: italic;
      }

      .token.entity {
        cursor: help;
      }

      @media screen and (-ms-high-contrast: active) {
        code[class*='language-'],
        pre[class*='language-'] {
          color: windowText;
          background: window;
        }

        :not(pre) > code[class*='language-'],
        pre[class*='language-'] {
          background: window;
        }

        .token.important {
          background: highlight;
          color: window;
          font-weight: normal;
        }

        .token.atrule,
        .token.attr-value,
        .token.function,
        .token.keyword,
        .token.operator,
        .token.selector {
          font-weight: bold;
        }

        .token.attr-value,
        .token.comment,
        .token.doctype,
        .token.function,
        .token.keyword,
        .token.operator,
        .token.property,
        .token.string {
          color: highlight;
        }

        .token.attr-value,
        .token.url {
          font-weight: normal;
        }
      }

      // TODO: add this in the prismjs plugin
      code {
        padding: 0.1em 0.2em;
        background-color: #2b2b2b;
        border-radius: 0.3em;
      }

      code[class*='language-'],
      pre[class*='language-'] {
        font-size: 16px;
        line-height: 1.3;
      }

      pre[class*='language-'] {
        margin-bottom: 1em;
      }

      pre[class='language-jsx'] {
        padding-bottom: 0;
      }

      .mdx-marker {
        background-color: rgba(255, 255, 255, 0.1);
        display: block;
        margin-right: -1em;
        margin-left: -1em;
        padding-right: 1em;
        padding-left: 0.75em;
        border-left: 0.25em solid #ffdc00;
      }
    `}
  </style>
)
