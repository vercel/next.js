import * as React from 'react'
import { noop as css } from '../helpers/noop-template'

export function Theme() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: css`
          [data-nextjs-call-stack-frame] > h6 {
            font-family: var(--font-stack-monospace);
            color: rgba(25, 25, 25, 1);
          }
          [data-nextjs-call-stack-frame] > p {
            padding-left: 1rem;
            font-size: 0.875rem;
            color: rgba(25, 25, 25, 0.5);
          }
        `,
      }}
    />
  )
}
