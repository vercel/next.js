/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["examples/with-mux-video/app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        red: "#ea3737",
      },
    },
    fontFamily: {
      sans: [
        "var(--sans)",
        "ui-sans-serif",
        "system-ui",
        "-apple-system",
        "BlinkMacSystemFont",
        "sans-serif",
        "Apple Color Emoji",
        "Segoe UI Emoji",
        "Segoe UI Symbol",
        "Noto Color Emoji",
      ],
      mono: ["var(--mono)", "ui-monospace", "monospace"],
    },
  },
  plugins: [],
};
