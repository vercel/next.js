import type { Preview } from '@storybook/react'
import { withDevOverlayContexts } from '../src/next-devtools/dev-overlay/storybook/with-dev-overlay-contexts'

const portalNode = document.querySelector('nextjs-portal')!
const shadowRoot = portalNode.attachShadow({ mode: 'open' })

const preview: Preview = {
  parameters: {
    a11y: {
      element: 'nextjs-portal',
      config: {
        standards: {
          ariaAttrs: {
            'aria-modal': {
              global: true,
            },
          },
        },
        rules: [
          {
            // It's incredibly hard to find a code highlighting theme that works
            // for both light and dark themes and passes WCAG color contrast.
            // These kind of tests should really only fail when you regress
            // on a value below threshold.
            id: 'color-contrast',
            selector: '.code-frame-lines',
            enabled: false,
          },
        ],
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      values: [
        { name: 'backdrop', value: 'rgba(250, 250, 250, 0.80)' },
        { name: 'background-100-light', value: '#ffffff' },
        { name: 'background-200-light', value: '#fafafa' },
        { name: 'background-100-dark', value: '#0a0a0a' },
        { name: 'background-200-dark', value: '#000000' },
      ],
      default: 'backdrop',
    },
  },
  globals: {
    a11y: {
      // Optional flag to prevent the automatic check
      manual: true,
    },
  },
  decorators: [withDevOverlayContexts({ shadowRoot })],
}

export default preview
