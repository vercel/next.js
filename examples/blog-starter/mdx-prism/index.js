const rangeParser = require("parse-numeric-range");
const rehype = require("rehype");
const visit = require("unist-util-visit");
const nodeToString = require("hast-util-to-string");
const unified = require("unified");
const parse = require("rehype-parse");
const refractor = require("refractor");
const addMarkers = require("./add-markers");

/**
 * This module walks through the node tree and does:
 * - gets the class name
 * - parses the class and extracts the highlight lines directyve and the language name
 * - highlights the code using refractor
 * - if markers are present then:
 *    - converts AST to HTML
 *    - then applies some fixes to make line highlighting work with JSX found here: https://github.com/gatsbyjs/gatsby/blob/master/packages/gatsby-remark-prismjs/src/directives.js#L113-L119
 *    - add markers using: https://github.com/rexxars/react-refractor/blob/master/src/addMarkers.js
 *    - converts the code back from HTML to AST
 *  - sets the code as value
 */

module.exports = (options = {}) => {
  return tree => {
    visit(tree, "element", visitor);
  };

  function visitor(node, index, parent) {
    if (!parent || parent.tagName !== "pre" || node.tagName !== "code") {
      return;
    }

    const className = getLangClass(node);
    const { highlightLines, splitLanguage } = parseLineNumberRange(className);
    const lang = getLanguage(splitLanguage);
    const markers = highlightLines;

    if (lang === null) {
      return;
    }

    let result;
    try {
      parent.properties.className = (parent.properties.className || []).concat(
        "language-" + lang
      );

      result = refractor.highlight(nodeToString(node), lang);

      if (markers && markers.length > 0) {
        // This blocks attempts this fix:
        // https://github.com/gatsbyjs/gatsby/blob/master/packages/gatsby-remark-prismjs/src/directives.js#L113-L119
        const PLAIN_TEXT_WITH_LF_TEST = /<span class="token plain-text">[^<]*\n[^<]*<\/span>/g;

        // AST to HTML
        let html_ = rehype()
          .stringify({ type: "root", children: result })
          .toString();

        // Fix JSX issue
        html_ = html_.replace(PLAIN_TEXT_WITH_LF_TEST, match => {
          console.log("match:", match);
          return match.replace(
            /\n/g,
            '</span>\n<span class="token plain-text">'
          );
        });

        // HTML to AST
        const hast_ = unified()
          .use(parse, { emitParseErrors: true, fragment: true })
          .parse(html_);

        // Add markers
        result = addMarkers(hast_.children, { markers });
      }
    } catch (err) {
      if (options.ignoreMissing && /Unkown language/.text(err.message)) {
        return;
      }

      throw err;
    }

    node.children = result;
  }
};

const parseLineNumberRange = language => {
  if (!language) {
    return "";
  }
  if (language.split("{").length > 1) {
    let [splitLanguage, ...options] = language.split("{");
    let highlightLines = [];
    options.forEach(option => {
      option = option.slice(0, -1);
      if (rangeParser.parse(option).length > 0) {
        highlightLines = rangeParser.parse(option).filter(n => n > 0);
      }
    });

    return {
      splitLanguage,
      highlightLines
    };
  }

  return { splitLanguage: language };
};

function getLangClass(node) {
  const className = node.properties.className || [];
  for (const item of className) {
    if (item.slice(0, 9) === "language-") {
      return item;
    }
  }
  return null;
}

function getLanguage(className = "") {
  if (className.slice(0, 9) === "language-") {
    return className.slice(9).toLowerCase();
  }

  return null;
}
