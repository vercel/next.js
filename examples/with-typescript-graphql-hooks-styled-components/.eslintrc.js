module.exports = {
  extends: "react-app",
  rules: {
    "react/react-in-jsx-scope": 0,
    "jsx-a11y/anchor-is-valid": [
      "error",
      {
        components: ["Link"],
        specialLink: ["hrefLeft", "hrefRight"],
        aspects: ["invalidHref", "preferButton"]
      }
    ]
  }
};
