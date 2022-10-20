const { parse } = require("url");
const PDFParser = require("pdf2json");

module.exports = (req, res) => {
  const { query } = parse(req.url, true);
  const { name = "World" } = query;
  res.end(`Hello ${name}!`);
};
