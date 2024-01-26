module.exports = {
  extends: "next/core-web-vitals",
  plugins: ["@stylexjs"],
  rules: {
    "@stylexjs/valid-styles": "error",
  },
};
