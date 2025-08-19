export default [
  {
    rules: {
      "no-console": "warn",
      "semi": ["error", "always"]
    }
  },
  {
    files: ["**/*.test.js"],
    rules: {
      "no-console": "off"
    }
  }
]