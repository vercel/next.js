import type { Preview } from '@storybook/react'

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      values: [
        { name: 'backdrop', value: 'rgb(44, 44, 46);' },
        { name: 'background-100-light', value: '#ffffff' },
        { name: 'background-200-light', value: '#fafafa' },
        { name: 'background-100-dark', value: '#0a0a0a' },
        { name: 'background-200-dark', value: '#000000' },
      ],
      default: 'backdrop',
    },
  },
}

export default preview
