import * as React from 'react'
import { noop as css } from '../helpers/noop-template'

export function Base() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: css`
          :host {
            --size-gap-half: 4px;
            --size-gap: 8px;
            --size-gap-double: 16px;
            --size-gap-quad: 32px;

            --size-font-small: 14px;
            --size-font: 16px;
            --size-font-big: 20px;
            --size-font-bigger: 24px;

            --color-accents-1: #808080;
            --color-accents-2: #222222;
            --color-accents-3: #404040;

            --font-stack-monospace: 'SFMono-Regular', Consolas,
              'Liberation Mono', Menlo, Courier, monospace;

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

          h1 {
            font-size: 40px;
          }
          h2 {
            font-size: 32px;
          }
          h3 {
            font-size: 28px;
          }
          h4 {
            font-size: 24px;
          }
          h5 {
            font-size: 20px;
          }
          h6 {
            font-size: 16px;
          }
        `,
      }}
    />
  )
}
