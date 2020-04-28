import * as React from 'react'
import { noop as css } from '../helpers/noop-template'

export function Base() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: css`
          :host {
            --font-stack-monospace: 'SFMono-Regular', Consolas,
              'Liberation Mono', Menlo, Courier, monospace;

            --color-ansi-selection: rgba(95, 126, 151, 0.48);
            --color-ansi-bg: #011627;
            --color-ansi-fg: #d6deeb;

            --color-ansi-white: #ffffff;
            --color-ansi-black: #011627;
            --color-ansi-blue: #82aaff;
            --color-ansi-cyan: #21c7a8;
            --color-ansi-green: #22da6e;
            --color-ansi-magenta: #c792ea;
            --color-ansi-red: #ef5350;
            --color-ansi-yellow: #addb67;
            --color-ansi-bright-white: #ffffff;
            --color-ansi-bright-black: #575656;
            --color-ansi-bright-blue: #82aaff;
            --color-ansi-bright-cyan: #7fdbca;
            --color-ansi-bright-green: #22da6e;
            --color-ansi-bright-magenta: #c792ea;
            --color-ansi-bright-red: #ef5350;
            --color-ansi-bright-yellow: #ffeb95;
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
            margin-bottom: 0.5rem;
            font-weight: 500;
            line-height: 1.2;
          }

          h1 {
            font-size: 2.5rem;
          }
          h2 {
            font-size: 2rem;
          }
          h3 {
            font-size: 1.75rem;
          }
          h4 {
            font-size: 1.5rem;
          }
          h5 {
            font-size: 1.25rem;
          }
          h6 {
            font-size: 1rem;
          }
        `,
      }}
    />
  )
}
