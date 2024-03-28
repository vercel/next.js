/** @type {import('tailwindcss').Config} */
const colors = require('tailwindcss/colors')

module.exports = {
  content: ['./components/**/*.tsx', './pages/**/*.tsx'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'accent-1': '#FAFAFA',
        'accent-2': '#EAEAEA',
        'accent-7': '#333',
        success: '#0070f3',
        cyan: '#79FFE1',
        primary: colors.blue,
      },
      typography: () => ({
        DEFAULT: {
          css: {
            'div[data-node-type="callout"]': {
              display: 'flex',
              'justify-content': 'flex-start',
              'align-items': 'flex-start',
              'background-color': '#F8FAFC',
              border: '1px solid #E2E8F0',
              padding: ' 1rem 1.5rem',
              gap: '0.5rem',
              'border-radius': '0.5rem',
              margin: '1rem 0',
              'word-break': 'break-word',
            },
            'div[data-node-type="callout-emoji"]': {
              background: '#E2E8F0',
              'border-radius': '0.5rem',
              minWidth: '1.75rem',
              width: '1.75rem',
              height: '1.5rem',
              display: 'flex',
              'margin-top': '0.3rem',
              'justify-content': 'center',
              'align-items': 'center',
              'font-size': '1rem',
            },
          },
        },
      }),
      spacing: {
        28: '7rem',
      },
      letterSpacing: {
        tighter: '-.04em',
      },
      lineHeight: {
        tight: 1.2,
      },
      fontSize: {
        '5xl': '2.5rem',
        '6xl': '2.75rem',
        '7xl': '4.5rem',
        '8xl': '6.25rem',
      },
      boxShadow: {
        sm: '0 5px 10px rgba(0, 0, 0, 0.12)',
        md: '0 8px 30px rgba(0, 0, 0, 0.12)',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
