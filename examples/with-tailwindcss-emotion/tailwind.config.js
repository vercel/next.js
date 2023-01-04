const colors = require('tailwindcss/colors')

/** @type {import('tailwindcss').Config} */
module.exports = {
  purge: ['./pages/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors,
    },
  },
  variants: {},
  plugins: [require('tailwindcss-filters')],
  // xwind options
  xwind: {
    mode: 'objectstyles',
  },
}
