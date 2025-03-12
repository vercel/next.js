import { css } from '../../utils/css'

export function Base() {
  return (
    <style>
      {css`
        :host {
          /* 
           * Although the style applied to the shadow host is isolated,
           * the element that attached the shadow host (i.e. "nextjs-portal")
           * is still affected by the parent's style (e.g. "body"). This may
           * occur style conflicts like "display: flex", with other children
           * elements therefore give the shadow host an absolute position.
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
            These used to be in rem units but we have realised
            that using rem to style the Dev Overlays is not a
            good idea because if the user sets their root font size
            to something tiny, they will not have a great time using
            the Overlays because they will appear unexpectedly tiny.

            In the future, we want to use these variables to offer
            a custom preference in the dropdown menu to alter the size
            of the Overlays.

            Ref: https://github.com/vercel/next.js/discussions/76812
          */
          --size-1: 1px;
          --size-2: 2px;
          --size-3: 3px;
          --size-4: 4px;
          --size-5: 5px;
          --size-6: 6px;
          --size-7: 7px;
          --size-8: 8px;
          --size-9: 9px;
          --size-10: 10px;
          --size-11: 11px;
          --size-12: 12px;
          --size-13: 13px;
          --size-14: 14px;
          --size-15: 15px;
          --size-16: 16px;
          --size-17: 17px;
          --size-18: 18px;
          --size-20: 20px;
          --size-22: 22px;
          --size-24: 24px;
          --size-26: 26px;
          --size-28: 28px;
          --size-30: 30px;
          --size-32: 32px;
          --size-34: 34px;
          --size-36: 36px;
          --size-38: 38px;
          --size-40: 40px;
          --size-42: 42px;
          --size-44: 44px;
          --size-46: 46px;
          --size-48: 48px;

          @media print {
            display: none;
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
