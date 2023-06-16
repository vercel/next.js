import fs from 'fs/promises'
import path from 'path'
import unified from 'unified'
import markdown from 'remark-parse'
import remarkToRehype from 'remark-rehype'
import raw from 'rehype-raw'
import visit from 'unist-util-visit'
import GithubSlugger from 'github-slugger'
import matter from 'gray-matter'
import * as github from '@actions/github'

/**
 * This script validates internal links in /docs including internal, hash,
 * source and related links. It does not validate external links.
 * 1. Recursively traverses the docs and collects all .mdx files.
 * 2. For each file, it extracts the content, metadata, and heading slugs.
 * 3. It creates a document map to efficiently lookup documents by path.
 * 4. It then traverses each document:
 *    - It checks if each internal link (links starting with "/docs/") points
 *      to an existing document
 *    - It validates hash links (links starting with "#") against the list of
 *      headings in the current document.
 *    - It checks the source and related links found in the metadata of each
 *      document.
 * 5. Any broken links discovered during these checks are categorized and logged
 *    to the console.
 */

const DOCS_PATH = './docs/'
const INTERNAL_DOCS_PATH = '/docs/'
const EXCLUDED_HASHES = ['top']
const EXCLUDED_PATHS = ['/docs/messages/']
const slugger = new GithubSlugger()

async function getMdxFiles(dir, fileList = []) {
  const files = await fs.readdir(dir)

  for (const file of files) {
    const filePath = path.join(dir, file)
    const stats = await fs.stat(filePath)

    if (stats.isDirectory()) {
      fileList = await getMdxFiles(filePath, fileList)
    } else if (path.extname(file) === '.mdx') {
      fileList.push(filePath)
    }
  }

  return fileList
}

function getHeadingsFromMarkdownTree(tree) {
  const headings = []
  slugger.reset()

  visit(tree, 'heading', (node) => {
    let headingText = ''
    visit(node, (node) => {
      if (node.value) {
        headingText += node.value
      }
    })
    headings.push(slugger.slug(headingText))
  })

  return headings
}

// Create a processor to parse mdx content
const markdownProcessor = unified()
  .use(markdown)
  .use(remarkToRehype, { allowDangerousHTML: true })
  .use(raw)
  .use(function compiler() {
    this.Compiler = function treeCompiler(tree) {
      return tree
    }
  })

async function prepareDocumentMapEntry(filePath) {
  const relativePath = path.relative(DOCS_PATH, filePath)
  // Remove the prefixing numbers used for ordering from the path
  const sanitizedPath = relativePath
    .replace(/(\d\d-)/g, '')
    .replace('.mdx', '')
    .replace('/index', '')

  const mdxContent = await fs.readFile(filePath, 'utf8')
  const { content, data } = matter(mdxContent)
  const tree = markdownProcessor.parse(content)
  const headings = getHeadingsFromMarkdownTree(tree)

  return [sanitizedPath, { body: content, path: filePath, headings, ...data }]
}

// use Map for faster lookup
let documentMap

function validateInternalLink(errors, href) {
  // split href into  link and hash link
  const [link, hash] = href.replace(INTERNAL_DOCS_PATH, '').split('#')
  const docExists = documentMap.get(link)

  if (!docExists) {
    errors.brokenLinks.push(
      `${INTERNAL_DOCS_PATH}${link}${hash ? '#' + hash : ''}`
    )
  } else if (hash && !EXCLUDED_HASHES.includes(hash)) {
    const sourceDoc = docExists.source
      ? documentMap.get(docExists.source)
      : undefined

    const hashExists = (sourceDoc || docExists).headings.includes(hash)

    if (!hashExists) {
      errors.brokenHashes.push(
        `${INTERNAL_DOCS_PATH}${link}${hash ? '#' + hash : ''}`
      )
    }
  }
}

function validateHashLink(errors, href, doc) {
  const hashLink = href.replace('#', '')

  if (!EXCLUDED_HASHES.includes(hashLink) && !doc.headings.includes(hashLink)) {
    errors.brokenHashes.push(href)
  }
}

function validateSourceLinks(doc, errors) {
  if (doc.source && !documentMap.get(doc.source)) {
    errors.brokenSourceLinks.push(doc.source)
  }
}

function validateRelatedLinks(doc, errors) {
  if (doc.related && doc.related.links) {
    doc.related.links.forEach((link) => {
      if (!documentMap.get(link)) {
        errors.brokenRelatedLinks.push(link)
      }
    })
  }
}

// Function to traverse the document tree and validate links
function traverseTreeAndValidateLinks(tree, doc) {
  const errors = {
    doc,
    brokenLinks: [],
    brokenHashes: [],
    brokenSourceLinks: [],
    brokenRelatedLinks: [],
  }

  visit(tree, (node) => {
    if (node.type === 'element' && node.tagName === 'a') {
      const href = node.properties.href

      if (!href) return

      if (
        href.startsWith(INTERNAL_DOCS_PATH) &&
        !EXCLUDED_PATHS.some((excludedPath) => href.startsWith(excludedPath))
      ) {
        validateInternalLink(errors, href, doc)
      } else if (href.startsWith('#')) {
        validateHashLink(errors, href, doc)
      }
    }
  })

  validateSourceLinks(doc, errors)
  validateRelatedLinks(doc, errors)

  return errors
}

const octokit = github.getOctokit(process.env.GITHUB_TOKEN)

async function createGithubComment(comment) {
  const { context = {} } = github
  const { pull_request } = context.payload
  const { number } = pull_request
  const { owner, repo } = context.repo

  try {
    const { data } = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: number,
      body: comment,
    })

    const commentUrl = data.html_url

    const sha = context.payload.pull_request.head.sha
    await octokit.rest.repos.createCommitStatus({
      owner,
      repo,
      sha,
      state: 'failure',
      description:
        'Found broken links in the documentation. Click details to see the comment.',
      context: 'Link Validation',
      target_url: commentUrl,
    })
  } catch (error) {
    console.error(`Error creating comment: ${error}`)
  }
}

async function validateAllInternalLinks() {
  const mdxFilePaths = await getMdxFiles(DOCS_PATH)
  documentMap = new Map(
    await Promise.all(mdxFilePaths.map(prepareDocumentMapEntry))
  )

  const allErrors = await Promise.all(
    Array.from(documentMap.values()).map(async (doc) => {
      const tree = (await markdownProcessor.process(doc.body)).contents
      return traverseTreeAndValidateLinks(tree, doc)
    })
  )

  let errorComment =
    'Hi there :wave:\n\nIt looks like this PR introduces internal broken links to the docs, please take a moment to fix them before merging:\n\n| :heavy-multiplication-x: Broken link | :page_facing_up: Found in... | Link Type         |\n| ----------- | ----------- | ------------ |\n'

  const formatTableRow = (link, docPath, type) => {
    const commitSHA = github.context.payload.pull_request.head.sha
    return `| ${link} | [/${docPath}](https://github.com/vercel/next.js/blob/${commitSHA}/${docPath}) | ${type} |\n`
  }

  allErrors.forEach((errors) => {
    const {
      doc: { path: docPath },
      brokenLinks,
      brokenHashes,
      brokenSourceLinks,
      brokenRelatedLinks,
    } = errors

    if (brokenLinks.length > 0) {
      brokenLinks.forEach((link) => {
        errorComment += formatTableRow(link, docPath, 'Path')
      })
    }

    if (brokenHashes.length > 0) {
      brokenHashes.forEach((hash) => {
        errorComment += formatTableRow(hash, docPath, 'Hash')
      })
    }

    if (brokenSourceLinks.length > 0) {
      brokenSourceLinks.forEach((link) => {
        errorComment += formatTableRow(link, docPath, 'Source')
      })
    }

    if (brokenRelatedLinks.length > 0) {
      brokenRelatedLinks.forEach((link) => {
        errorComment += formatTableRow(link, docPath, 'Related')
      })
    }
  })

  errorComment += '\nThank you :pray:'

  // Create the comment if any errors have been found
  if (allErrors.length > 0) {
    await createGithubComment(errorComment)
    throw new Error('Internal broken docs links found. See PR comment.')
  }
}

validateAllInternalLinks()
