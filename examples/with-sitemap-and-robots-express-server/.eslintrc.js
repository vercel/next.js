module.exports = {
  parser: "babel-eslint",
  extends: "airbnb",
  env: {
    browser: true,
    jest: true
  },
  plugins: ["react", "jsx-a11y", "import"],
  rules: {
    "max-len": ["error", 100],
    semi: ["error", "never"],
    quotes: ["error", "single"],
    "comma-dangle": ["error", "never"],
    "space-before-function-paren": ["error", "always"],
    "no-underscore-dangle": ["error", { allow: ["_id"] }],
    "prefer-destructuring": [
      "error",
      {
        VariableDeclarator: {
          array: false,
          object: true
        },
        AssignmentExpression: {
          array: true,
          object: false
        }
      },
      {
        enforceForRenamedProperties: false
      }
    ],
    "import/prefer-default-export": "off",
    "jsx-a11y/anchor-is-valid": "off",
    "react/react-in-jsx-scope": "off",
    "react/jsx-filename-extension": [
      "error",
      {
        extensions: [".js"]
      }
    ]
  }
};
