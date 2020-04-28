import * as React from 'react'
import { noop as css } from '../noop-template'

export function Base() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: css`
          :host {
            --font-stack-monospace: 'SFMono-Regular', Consolas,
              'Liberation Mono', Menlo, Courier, monospace;
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
