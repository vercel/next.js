import { css } from '../../utils/css'

const darkTheme = css`
  --color-font: white;
  --color-backdrop: rgba(0, 0, 0, 0.8);
  --color-border-shadow: rgba(255, 255, 255, 0.145);

  --color-title-color: #fafafa;
  --color-stack-notes: #a9a9a9;
`

export function Base() {
  return (
    <style>
      {css`
        :host {
          /* 
            Although the style applied to the shadow host is isolated,
            the element that attached the shadow host (i.e. "nextjs-portal")
            is still affected by the parent's style (e.g. "body"). This may
            occur style conflicts like "display: flex", with other children
            elements therefore give the shadow host an absolute position.
          */
          position: absolute;

          --color-font: #757575;
          --color-backdrop: rgba(250, 250, 250, 0.8);
          --color-border-shadow: rgba(0, 0, 0, 0.145);

          --color-title-color: #1f1f1f;
          --color-stack-notes: #777;

          --color-accents-1: #808080;
          --color-accents-2: #222222;
          --color-accents-3: #404040;

          --font-stack-monospace: '__nextjs-Geist Mono', 'Geist Mono',
            'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier,
            monospace;
          --font-stack-sans: '__nextjs-Geist', 'Geist', -apple-system,
            'Source Sans Pro', sans-serif;

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
          --rounded-sm: 2px;
          --rounded-md: 4px;
          --rounded-md-2: 6px;
          --rounded-lg: 8px;
          --rounded-xl: 12px;
          --rounded-2xl: 16px;
          --rounded-3xl: 24px;
          --rounded-4xl: 32px;
          --rounded-full: 9999px;

          /* 
            Suffix N of --size-N as px value when the base font size is 16px.
            Example: --size-1 is 1px, --size-2 is 2px, --size-3 is 3px, etc.
          */
          --size-1: 0.0625rem; /* 1px */
          --size-2: 0.125rem; /* 2px */
          --size-3: 0.1875rem; /* 3px */
          --size-4: 0.25rem; /* ...and more */
          --size-5: 0.3125rem;
          --size-6: 0.375rem;
          --size-7: 0.4375rem;
          --size-8: 0.5rem;
          --size-9: 0.5625rem;
          --size-10: 0.625rem;
          --size-11: 0.6875rem;
          --size-12: 0.75rem;
          --size-13: 0.8125rem;
          --size-14: 0.875rem;
          --size-15: 0.9375rem;
          /* If the base font size of the dev overlay changes e.g. 18px, 
          just slide the window and make --size-18 as 1rem. */
          --size-16: 1rem;
          --size-17: 1.0625rem;
          --size-18: 1.125rem;
          --size-20: 1.25rem;
          --size-22: 1.375rem;
          --size-24: 1.5rem;
          --size-26: 1.625rem;
          --size-28: 1.75rem;
          --size-30: 1.875rem;
          --size-32: 2rem;
          --size-34: 2.125rem;
          --size-36: 2.25rem;
          --size-38: 2.375rem;
          --size-40: 2.5rem;
          --size-42: 2.625rem;
          --size-44: 2.75rem;
          --size-46: 2.875rem;
          --size-48: 3rem;

          @media print {
            display: none;
          }
        }

        :host(.dark) {
          ${darkTheme}
        }

        @media (prefers-color-scheme: dark) {
          :host {
            ${darkTheme}
          }
        }

        h1,
        h2,
        h3,
        h4,
        h5,
        h6 {
          margin-bottom: 8px;
          font-weight: 500;
          line-height: 1.5;
        }

        a {
          color: var(--color-blue-900);
          &:hover {
            color: var(--color-blue-900);
          }
          &:focus {
            outline: var(--focus-ring);
          }
        }
      `}
    </style>
  )
}
