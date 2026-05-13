// importing externals should work fine
require('fs')
require('path')

// importing typescript files should work fine
require('./my-plugin')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
}
