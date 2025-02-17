import * as React from 'react'
import { noop as css } from '../helpers/noop-template'

export function Base() {
  return (
    <style>
      {css`
        :host {
          ${
            // Although the style applied to the shadow host is isolated,
            // the element that attached the shadow host (i.e. `nextjs-portal`)
            // is still affected by the parent's style (e.g. `body`). This may
            // occur style conflicts like `display: flex`, with other children
            // elements therefore give the shadow host an absolute position.
            'position: absolute;'
          }

          --size-gap-half: 4px;
          --size-gap: 8px;
          --size-gap-double: 16px;
          --size-gap-triple: 24px;
          --size-gap-quad: 32px;

          --size-font-small: 14px;
          --size-font: 16px;
          --size-font-big: 20px;
          --size-font-bigger: 24px;

          --color-background: white;
          --color-font: #757575;
          --color-backdrop: rgba(17, 17, 17, 0.2);
          --color-border-shadow: rgba(0, 0, 0, 0.145);

          --color-title-color: #1f1f1f;
          --color-stack-h6: #222;
          --color-stack-headline: #666;
          --color-stack-subline: #999;
          --color-stack-notes: #777;

          --color-accents-1: #808080;
          --color-accents-2: #222222;
          --color-accents-3: #404040;

          --color-text-color-red-1: #ff5555;
          --color-text-background-red-1: #fff9f9;

          --font-stack-monospace: 'SFMono-Regular', Consolas, 'Liberation Mono',
            Menlo, Courier, monospace;
          --font-stack-sans: -apple-system, 'Source Sans Pro', sans-serif;

          --color-ansi-selection: rgba(95, 126, 151, 0.48);
          --color-ansi-bg: #111111;
          --color-ansi-fg: #cccccc;

          --color-ansi-white: #777777;
          --color-ansi-black: #141414;
          --color-ansi-blue: #00aaff;
          --color-ansi-cyan: #88ddff;
          --color-ansi-green: #98ec65;
          --color-ansi-magenta: #aa88ff;
          --color-ansi-red: #ff5555;
          --color-ansi-yellow: #ffcc33;
          --color-ansi-bright-white: #ffffff;
          --color-ansi-bright-black: #777777;
          --color-ansi-bright-blue: #33bbff;
          --color-ansi-bright-cyan: #bbecff;
          --color-ansi-bright-green: #b6f292;
          --color-ansi-bright-magenta: #cebbff;
          --color-ansi-bright-red: #ff8888;
          --color-ansi-bright-yellow: #ffd966;

          @media print {
            display: none;
          }
        }

        @media (prefers-color-scheme: dark) {
          :host {
            --color-background: rgb(28, 28, 30);
            --color-font: white;
            --color-backdrop: rgb(44, 44, 46);
            --color-border-shadow: rgba(255, 255, 255, 0.145);

            --color-title-color: #fafafa;
            --color-stack-h6: rgb(200, 200, 204);
            --color-stack-headline: rgb(99, 99, 102);
            --color-stack-notes: #a9a9a9;
            --color-stack-subline: rgb(121, 121, 121);

            --color-accents-3: rgb(118, 118, 118);

            --color-text-background-red-1: #2a1e1e;
          }
        }

        .mono {
          font-family: var(--font-stack-monospace);
        }

        h1,
        h2,
        h3,
        h4,
        h5,
        h6 {
          margin-bottom: var(--size-gap);
          font-weight: 500;
          line-height: 1.5;
        }
      `}
    </style>
  )
}
