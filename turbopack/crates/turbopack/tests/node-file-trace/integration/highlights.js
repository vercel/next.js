const Highlights = require("highlights");
const highlighter = new Highlights();
highlighter.highlightSync({
  fileContents: 'var hello = "world";',
  scopeName: "source.js",
});
