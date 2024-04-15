/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {},
    fontFamily: {
      sans: ["var(--sans)", "sans-serif"],
      mono: ["var(--mono)", "monospace"],
    },
  },
  plugins: [],
};
