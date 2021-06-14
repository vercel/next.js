const colors = require('tailwindcss/colors')

module.exports = {
  mode: 'jit',
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
