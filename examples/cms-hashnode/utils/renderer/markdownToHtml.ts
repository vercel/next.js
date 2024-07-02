import sanitizeHtml from 'sanitize-html'
import sanitizeHtmlOptions from './sanitizeHTMLOptions'

const marked = require('./marked')
const renderer = new marked.Renderer()
const imageReplacer = require('./image').imageReplacer

// @ts-ignore
renderer.link = function (href, title, text) {
  var link = marked.Renderer.prototype.link.call(this, href, title, text)
  var linkIsUserMention =
    title &&
    title.includes('s Profile - Hashnode') &&
    href &&
    href.includes('https://hashnode.com')

  if (linkIsUserMention) {
    return link.replace(
      '<a',
      "<a class='user-mention' target='_blank' rel='noopener noreferrer'"
    )
  }
  if (href.indexOf('#') === 0) {
    return link.replace('<a', "<a class='post-section-overview'")
  }
  return link.replace('<a', "<a target='_blank' rel='noopener noreferrer' ")
}

// @ts-ignore
renderer.tablecell = function (content) {
  var chunks = content.split('&lt;br&gt;-')

  if (chunks.length === 1) {
    return '<td>' + content + '</td>'
  }

  if (chunks[0].indexOf('- ') === 0) {
    chunks[0] = chunks[0].substring(1)
  }

  var html = ''

  // @ts-ignore
  chunks.forEach(function (chunk) {
    html += '<li>' + chunk + '</li>'
  })

  return '<td><ul>' + html + '</ul></td>'
}

const markedOpts = {
  renderer: renderer,
  gfm: true,
  tables: true,
  sanitize: false,
  // @ts-ignore
  highlight: function (code, lang) {
    const highlightjs = require('./highlight')
    // Fix to prevent content-preview API from crashing on inputting long codeblocks with mixed characters without language.
    lang = lang || 'javascript'
    if (!lang) {
      return highlightjs.highlightAuto(code).value
    }
    if (highlightjs.getLanguage(lang)) {
      return highlightjs.highlight(lang, code, true).value
    } else {
      return highlightjs.highlightAuto(code, []).value
    }
  },
}

const extractMentions = (content: string) => {
  const regex = /@<a([^>]*)href="@(\S+)"([^>]*)>((?:.(?!\<\/a\>))*.)<\/a>/g

  const replacer = (substring: string, ...args: any[]) => {
    const [p1, p2, p3, p4] = args
    return `<a target='_blank' rel='noopener noreferrer' href="https://hashnode.com/@${p2}">${p4}</a>`
  }
  return content.replace(regex, replacer)
}

const getSanitizedHTML = (content: string) => {
  return sanitizeHtml(content, sanitizeHtmlOptions)
}

const getHTMLFromMarkdown = (contentMarkdown: string) => {
  return marked(contentMarkdown, markedOpts)
}

const getOptimizedImages = (content: string) => {
  return imageReplacer(content, true)
}

const pipe =
  (...fns: any[]) =>
  (x: any) =>
    fns.reduce((v, f) => f(v), x)

export const markdownToHtml = (contentMarkdown: string) => {
  const content = pipe(
    getHTMLFromMarkdown,
    getSanitizedHTML,
    extractMentions,
    getOptimizedImages
  )(contentMarkdown)

  return content
}
