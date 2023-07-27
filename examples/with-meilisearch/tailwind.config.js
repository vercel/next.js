/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/pages/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)'],
        title: ['var(--font-poppins)'],
      },
      colors: {
        primary: '#FF5CAA',
      },
    },
  },
  plugins: [],
}
