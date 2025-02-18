import * as React from 'react'
import { noop as css } from '../helpers/noop-template'

export function Base() {
  return (
    <style>
      {css`
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600&display=swap');

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

          --size-font-11: 11px;
          --size-font-smaller: 12px;
          --size-font-small: 14px;
          --size-font: 16px;
          --size-font-big: 20px;
          --size-font-bigger: 24px;

          --color-background: white;
          --color-font: #757575;
          --color-backdrop: rgba(250, 250, 250, 0.8);
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

          --font-stack-monospace: 'Geist Mono', 'SFMono-Regular', Consolas,
            'Liberation Mono', Menlo, Courier, monospace;
          --font-stack-sans: 'Geist', -apple-system, 'Source Sans Pro',
            sans-serif;

          font-family: var(--font-stack-sans);

          /* TODO: Remove replaced ones. */
          --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
          --shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1),
            0 1px 2px -1px rgb(0 0 0 / 0.1);
          --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1),
            0 2px 4px -2px rgb(0 0 0 / 0.1);
          --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1),
            0 4px 6px -4px rgb(0 0 0 / 0.1);
          --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1),
            0 8px 10px -6px rgb(0 0 0 / 0.1);
          --shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);
          --shadow-inner: inset 0 2px 4px 0 rgb(0 0 0 / 0.05);
          --shadow-none: 0 0 #0000;

          --shadow-small: 0px 2px 2px rgba(0, 0, 0, 0.04);
          --shadow-menu: 0px 1px 1px rgba(0, 0, 0, 0.02),
            0px 4px 8px -4px rgba(0, 0, 0, 0.04),
            0px 16px 24px -8px rgba(0, 0, 0, 0.06);

          --focus-color: var(--color-blue-800);
          --focus-ring: 2px solid var(--focus-color);

          --timing-swift: cubic-bezier(0.23, 0.88, 0.26, 0.92);
          --timing-overlay: cubic-bezier(0.175, 0.885, 0.32, 1.1);

          --rounded-none: 0px;
          --rounded-sm: 0.125rem; /* 2px */
          --rounded-md: 0.25rem; /* 4px */
          --rounded-lg: 0.5rem; /* 8px */
          --rounded-xl: 0.75rem; /* 12px */
          --rounded-2xl: 1rem; /* 16px */
          --rounded-3xl: 1.5rem; /* 24px */
          --rounded-full: 9999px;

          --size-0: 0px;
          --size-px: 1px;
          --size-0_5: 0.125rem; /* 2px */
          --size-1: 0.25rem; /* 4px */
          --size-1_5: 0.375rem; /* 6px */
          --size-2: 0.5rem; /* 8px */
          --size-2_5: 0.625rem; /* 10px */
          --size-3: 0.75rem; /* 12px */
          --size-3_5: 0.875rem; /* 14px */
          --size-4: 1rem; /* 16px */
          --size-4_5: 1.125rem; /* 18px */
          --size-5: 1.25rem; /* 20px */
          --size-5_5: 1.375rem; /* 22px */
          --size-6: 1.5rem; /* 24px */
          --size-6_5: 1.625rem; /* 26px */
          --size-7: 1.75rem; /* 28px */
          --size-7_5: 1.875rem; /* 30px */
          --size-8: 2rem; /* 32px */
          --size-8_5: 2.125rem; /* 34px */
          --size-9: 2.25rem; /* 36px */
          --size-9_5: 2.375rem; /* 38px */
          --size-10: 2.5rem; /* 40px */
          --size-10_5: 2.625rem; /* 42px */
          --size-11: 2.75rem; /* 44px */
          --size-11_5: 2.875rem; /* 46px */
          --size-12: 3rem; /* 48px */

          @media print {
            display: none;
          }
        }

        @media (prefers-color-scheme: dark) {
          :host {
            --color-background: rgb(28, 28, 30);
            --color-font: white;
            --color-backdrop: rgb(0, 0, 0, 0.8);
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
