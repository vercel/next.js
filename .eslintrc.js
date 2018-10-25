module.exports = {
  extends: ["airbnb", "prettier", "prettier/react"],
  parser: "babel-eslint",
  plugins: ["prettier"],
  rules: {
    "prettier/prettier": ["error"],
    // Allow JSX in .js file extension as well as default .jsx
    "react/jsx-filename-extension": ["error", { extensions: [".js", ".jsx"] }],
    // next.js automatically has React in scope, so turn off requiring React
    "react/react-in-jsx-scope": "off"
  }
};
