import { css } from '../../utils/css'
import type { DevToolsScale } from '../components/errors/dev-tools-indicator/dev-tools-info/preferences'

export function Base({ scale = 1 }: { scale?: DevToolsScale }) {
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
            This value gets set from the Dev Tools preferences,
            and we use the following --size-* variables to 
            scale the relevant elements.

            The reason why we don't rely on rem values is because
            if an app sets their root font size to something tiny, 
            it feels unexpected to have the app root size leak 
            into a Next.js surface.

            https://github.com/vercel/next.js/discussions/76812
          */
          --nextjs-dev-tools-scale: ${String(scale)};
          --size-1: calc(1px / var(--nextjs-dev-tools-scale));
          --size-2: calc(2px / var(--nextjs-dev-tools-scale));
          --size-3: calc(3px / var(--nextjs-dev-tools-scale));
          --size-4: calc(4px / var(--nextjs-dev-tools-scale));
          --size-5: calc(5px / var(--nextjs-dev-tools-scale));
          --size-6: calc(6px / var(--nextjs-dev-tools-scale));
          --size-7: calc(7px / var(--nextjs-dev-tools-scale));
          --size-8: calc(8px / var(--nextjs-dev-tools-scale));
          --size-9: calc(9px / var(--nextjs-dev-tools-scale));
          --size-10: calc(10px / var(--nextjs-dev-tools-scale));
          --size-11: calc(11px / var(--nextjs-dev-tools-scale));
          --size-12: calc(12px / var(--nextjs-dev-tools-scale));
          --size-13: calc(13px / var(--nextjs-dev-tools-scale));
          --size-14: calc(14px / var(--nextjs-dev-tools-scale));
          --size-15: calc(15px / var(--nextjs-dev-tools-scale));
          --size-16: calc(16px / var(--nextjs-dev-tools-scale));
          --size-17: calc(17px / var(--nextjs-dev-tools-scale));
          --size-18: calc(18px / var(--nextjs-dev-tools-scale));
          --size-20: calc(20px / var(--nextjs-dev-tools-scale));
          --size-22: calc(22px / var(--nextjs-dev-tools-scale));
          --size-24: calc(24px / var(--nextjs-dev-tools-scale));
          --size-26: calc(26px / var(--nextjs-dev-tools-scale));
          --size-28: calc(28px / var(--nextjs-dev-tools-scale));
          --size-30: calc(30px / var(--nextjs-dev-tools-scale));
          --size-32: calc(32px / var(--nextjs-dev-tools-scale));
          --size-34: calc(34px / var(--nextjs-dev-tools-scale));
          --size-36: calc(36px / var(--nextjs-dev-tools-scale));
          --size-38: calc(38px / var(--nextjs-dev-tools-scale));
          --size-40: calc(40px / var(--nextjs-dev-tools-scale));
          --size-42: calc(42px / var(--nextjs-dev-tools-scale));
          --size-44: calc(44px / var(--nextjs-dev-tools-scale));
          --size-46: calc(46px / var(--nextjs-dev-tools-scale));
          --size-48: calc(48px / var(--nextjs-dev-tools-scale));

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
