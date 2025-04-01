import type { Preview } from '@storybook/react'

const preview: Preview = {
  parameters: {
    a11y: {
      element: 'nextjs-portal',
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
}

export default preview
