import rule from '@next/eslint-plugin-next/lib/rules/invalid-head-children'
import { Linter } from 'eslint'
import assert from 'assert'

const linter = new Linter({ cwd: __dirname })

const linterConfig: any = {
  rules: {
    'invalid-head-children': 1
  },
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    ecmaFeatures: {
      modules: true,
      jsx: true
    }
  }  
}

linter.defineRule('invalid-head-children', rule)

const htmlTags = ["a",
  "abbr",
  "acronym",
  "address",
  "applet",
  "area",
  "article",
  "aside",
  "audio",
  "b",
  "base",
  "basefont",
  "bdi",
  "bdo",
  "bgsound",
  "big",
  "blink",
  "blockquote",
  "body",
  "br",
  "button",
  "canvas",
  "caption",
  "center",
  "cite",
  "code",
  "col",
  "colgroup",
  "content",
  "data",
  "datalist",
  "dd",
  "decorator",
  "del",
  "details",
  "dfn",
  "dir",
  "div",
  "dl",
  "dt",
  "element",
  "em",
  "embed",
  "fieldset",
  "figcaption",
  "figure",
  "font",
  "footer",
  "form",
  "frame",
  "frameset",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hgroup",
  "hr",
  "html",
  "i",
  "iframe",
  "img",
  "input",
  "ins",
  "isindex",
  "kbd",
  "keygen",
  "label",
  "legend",
  "li",
  "link",
  "listing",
  "main",
  "map",
  "mark",
  "marquee",
  "menu",
  "menuitem",
  "meta",
  "meter",
  "nav",
  "nobr",
  "noframes",
  "noscript",
  "object",
  "ol",
  "optgroup",
  "option",
  "output",
  "p",
  "param",
  "plaintext",
  "pre",
  "progress",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "script",
  "section",
  "select",
  "shadow",
  "small",
  "source",
  "spacer",
  "span",
  "strike",
  "strong",
  "style",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "template",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "time",
  "title",
  "tr",
  "track",
  "tt",
  "u",
  "ul",
  "var",
  "video",
  "wbr",
  "xmp"
]

const { allowedHeadChildren } = rule

function getRandomInvalidHeadChildren(htmlTags: Array<string>) {
  let tag = htmlTags[Math.floor(Math.random() * htmlTags.length)]
  if (allowedHeadChildren.has(tag)) {
    tag = getRandomInvalidHeadChildren(htmlTags)
  }
  return tag
}

describe('invalid-head-children', function() {
  it('pass valid head children', function() {
    const validCode = `
      import Head from "next/head"
    
      export default function Test() {
        return (
          <Head>
            <title>My page title</title>
          </Head>
        )
      }
    `
    const report = linter.verify(validCode, linterConfig)
    assert.deepEqual(report, [])
  })
  it ('warn about invalid head children', function() {
    const randomInvalidHtmlTag = getRandomInvalidHeadChildren(htmlTags)
    const invalidCode = `
      import Head from "next/head"

      export default function Test() {
        return (
          <Head>
            <${randomInvalidHtmlTag}>This tag is invalid</${randomInvalidHtmlTag}>
          </Head>
        )
      }
    `
    const [report] = linter.verify(invalidCode, linterConfig)
    assert.equal(
      report.message,
      `HTML element of type <${randomInvalidHtmlTag}> should not be included in next/head component`
    )
  })
})