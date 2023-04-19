import { noop as css } from '../helpers/noop-template'

export function Base() {
  return (
    <style>
      {css`
        :host {
          --size-gap-half: 4px;
          --size-gap: 8px;
          --size-gap-big: 12px;
          --size-gap-double: 16px;
          --size-gap-triple: 24px;
          --size-gap-quad: 32px;

          --size-font-small: 14px;
          --size-font: 16px;
          --size-font-big: 20px;
          --size-font-bigger: 24px;

          --size-icon: 24px;
          --size-icon-small: 12px;

          --size-border-half: 1px;
          --size-border: 2px;
          --size-border-double: 4px;

          --color-text: hsl(0, 0%, 0%);
          --color-text-dim: hsl(0, 0%, 20%);
          --color-text-white: hsl(0, 0%, 100%);

          --color-error: hsl(-10, 100%, 45%);
          --color-error-bright-hsl: -10, 100%, 67%;
          --color-error-bright: hsl(var(--color-error-bright-hsl));

          --color-warning: hsl(33.3, 100%, 47.5%);
          --color-warning-bright-hsl: 33.3, 100%, 50%;
          --color-warning-bright: hsl(var(--color-warning-bright-hsl));

          --color-bg: hsl(0 0% 100%);
          --color-bg-secondary: hsl(0 0% 93.5%);
          --color-bg-secondary-hover: hsl(0 0% 90%);

          --color-accents-1: hsl(0, 0%, 50%);
          --color-accents-2: hsl(0, 0%, 13%);
          --color-accents-3: hsl(0, 0%, 25%);

          --color-border: hsla(0, 0%, 80%, 0.7);

          --border-half: var(--size-border-half) solid var(--color-border);
          --border: var(--size-border) solid var(--color-border);

          --font-sans: ui-sans-serif, system-ui, -apple-system,
            BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
            'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji',
            'Segoe UI Symbol', 'Noto Color Emoji';
          --font-serif: ui-serif, Georgia, Cambria, 'Times New Roman', Times,
            serif;
          --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            'Liberation Mono', 'Courier New', monospace;

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
          font-family: var(--font-mono);
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
          font-size: 26px;
        }

        h2 {
          font-size: 24px;
        }

        h3 {
          font-size: 22px;
        }

        h4 {
          font-size: 20px;
        }

        h5 {
          font-size: 18px;
        }

        h6 {
          font-size: 16px;
        }
      `}
    </style>
  )
}
