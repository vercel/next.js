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
          font-variant-ligatures: none;

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
          /* prettier-ignore */
          --timing-bounce: linear(0 0%, 0.005871 1%, 0.022058 2%, 0.046612 3%, 0.077823 4%, 0.114199 5%, 0.154441 6%, 0.197431 7.000000000000001%, 0.242208 8%, 0.287959 9%, 0.333995 10%, 0.379743 11%, 0.424732 12%, 0.46858 13%, 0.510982 14.000000000000002%, 0.551702 15%, 0.590564 16%, 0.627445 17%, 0.662261 18%, 0.694971 19%, 0.725561 20%, 0.754047 21%, 0.780462 22%, 0.804861 23%, 0.82731 24%, 0.847888 25%, 0.866679 26%, 0.883775 27%, 0.899272 28.000000000000004%, 0.913267 28.999999999999996%, 0.925856 30%, 0.937137 31%, 0.947205 32%, 0.956153 33%, 0.96407 34%, 0.971043 35%, 0.977153 36%, 0.982479 37%, 0.987094 38%, 0.991066 39%, 0.994462 40%, 0.997339 41%, 0.999755 42%, 1.001761 43%, 1.003404 44%, 1.004727 45%, 1.00577 46%, 1.006569 47%, 1.007157 48%, 1.007563 49%, 1.007813 50%, 1.007931 51%, 1.007939 52%, 1.007855 53%, 1.007697 54%, 1.007477 55.00000000000001%, 1.00721 56.00000000000001%, 1.006907 56.99999999999999%, 1.006576 57.99999999999999%, 1.006228 59%, 1.005868 60%, 1.005503 61%, 1.005137 62%, 1.004776 63%, 1.004422 64%, 1.004078 65%, 1.003746 66%, 1.003429 67%, 1.003127 68%, 1.00284 69%, 1.002571 70%, 1.002318 71%, 1.002082 72%, 1.001863 73%, 1.00166 74%, 1.001473 75%, 1.001301 76%, 1.001143 77%, 1.001 78%, 1.000869 79%, 1.000752 80%, 1.000645 81%, 1.00055 82%, 1.000464 83%, 1.000388 84%, 1.000321 85%, 1.000261 86%, 1.000209 87%, 1.000163 88%, 1.000123 89%, 1.000088 90%);

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
