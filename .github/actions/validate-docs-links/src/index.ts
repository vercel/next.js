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
import type { Node, Data } from 'unist'

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
 * 5. Any broken links discovered during these checks are categorized and a
 * comment is added to the PR.
 */

interface Document {
  body: string
  path: string
  headings: string[]
  source?: string
  related?: {
    links: string[]
  }
}

interface Errors {
  doc: Document
  brokenLinks: string[]
  brokenHashes: string[]
  brokenSourceLinks: string[]
  brokenRelatedLinks: string[]
}

interface Comment {
  id: number
}

const DOCS_PATH = '/docs/'
const EXCLUDED_PATHS = ['/docs/messages/']
const EXCLUDED_HASHES = ['top']
const COMMENT_TAG = '<!-- LINK_CHECKER_COMMENT -->'

const { context, getOctokit } = github
const octokit = getOctokit(process.env.GITHUB_TOKEN!)
const { owner, repo } = context.repo
const pullRequest = context.payload.pull_request!
const sha = pullRequest.head.sha

const slugger = new GithubSlugger()

// Recursively traverses DOCS_PATH and collects all .mdx files
async function getMdxFiles(
  dir: string,
  fileList: string[] = []
): Promise<string[]> {
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

// Returns the slugs of all headings in a tree
function getHeadingsFromMarkdownTree(tree: Node<Data>): string[] {
  const headings: string[] = []
  slugger.reset()

  visit(tree, 'heading', (node) => {
    let headingText = ''
    // Account for headings with inline code blocks by concatenating the
    // text values of all children of a heading node.
    visit(node, (node: any) => {
      if (node.value) {
        headingText += node.value
      }
    })
    headings.push(slugger.slug(headingText))
  })

  return headings
}

// Create a processor to parse MDX content
const markdownProcessor = unified()
  .use(markdown)
  .use(remarkToRehype, { allowDangerousHTML: true })
  .use(raw)
  .use(function compiler() {
    // A compiler is required, and we only need the AST, so we can
    // just return it.
    // @ts-ignore
    this.Compiler = function treeCompiler(tree) {
      return tree
    }
  })

// use Map for faster lookup
let documentMap: Map<string, Document>

// Create a map of documents with their relative paths as keys and
// document content and metadata as values
async function prepareDocumentMapEntry(
  filePath: string
): Promise<[string, Document]> {
  const relativePath = path.relative('.' + DOCS_PATH, filePath)

  // Remove prefixed numbers used for ordering from the path
  const normalizedPath = relativePath
    .replace(/(\d\d-)/g, '')
    .replace('.mdx', '')
    .replace('/index', '')

  const mdxContent = await fs.readFile(filePath, 'utf8')
  const { content, data } = matter(mdxContent)
  const tree = markdownProcessor.parse(content)
  const headings = getHeadingsFromMarkdownTree(tree)

  return [normalizedPath, { body: content, path: filePath, headings, ...data }]
}

// Checks if the links point to existing documents
function validateInternalLink(errors: Errors, href: string): void {
  // split href into link and hash link
  const [link, hash] = href.replace(DOCS_PATH, '').split('#')
  const docExists = documentMap.get(link)

  if (!docExists) {
    errors.brokenLinks.push(`${DOCS_PATH}${link}${hash ? '#' + hash : ''}`)
  } else if (hash && !EXCLUDED_HASHES.includes(hash)) {
    // Account for documents that pull their content from another document
    const sourceDoc = docExists.source
      ? documentMap.get(docExists.source)
      : undefined

    // Check if the hash link points to an existing section within the document
    const hashExists = (sourceDoc || docExists).headings.includes(hash)

    if (!hashExists) {
      errors.brokenHashes.push(`${DOCS_PATH}${link}${hash ? '#' + hash : ''}`)
    }
  }
}

// Checks if the hash links point to existing sections within the same document
function validateHashLink(errors: Errors, href: string, doc: Document): void {
  const hashLink = href.replace('#', '')

  if (!EXCLUDED_HASHES.includes(hashLink) && !doc.headings.includes(hashLink)) {
    errors.brokenHashes.push(href)
  }
}

// Checks if the source link points to an existing document
function validateSourceLinks(doc: Document, errors: Errors): void {
  if (doc.source && !documentMap.get(doc.source)) {
    errors.brokenSourceLinks.push(doc.source)
  }
}

// Checks if the related links point to existing documents
function validateRelatedLinks(doc: Document, errors: Errors): void {
  if (doc.related && doc.related.links) {
    doc.related.links.forEach((link) => {
      if (!documentMap.get(link)) {
        errors.brokenRelatedLinks.push(link)
      }
    })
  }
}

// Traverse the document tree and validate links
function traverseTreeAndValidateLinks(tree: any, doc: Document): Errors {
  const errors: Errors = {
    doc,
    brokenLinks: [],
    brokenHashes: [],
    brokenSourceLinks: [],
    brokenRelatedLinks: [],
  }

  visit(tree, (node: any) => {
    if (node.type === 'element' && node.tagName === 'a') {
      const href = node.properties.href

      if (!href) return

      if (
        href.startsWith(DOCS_PATH) &&
        !EXCLUDED_PATHS.some((excludedPath) => href.startsWith(excludedPath))
      ) {
        validateInternalLink(errors, href)
      } else if (href.startsWith('#')) {
        validateHashLink(errors, href, doc)
      }
    }
  })

  validateSourceLinks(doc, errors)
  validateRelatedLinks(doc, errors)

  return errors
}

async function findBotComment(): Promise<Comment | undefined> {
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: context.payload.pull_request?.number!,
  })

  return comments.find((c) => c.body?.includes(COMMENT_TAG))
}

async function updateComment(
  comment: string,
  botComment: Comment
): Promise<string> {
  const { data } = await octokit.rest.issues.updateComment({
    owner,
    repo,
    comment_id: botComment.id,
    body: comment,
  })

  return data.html_url
}

async function createComment(comment: string): Promise<string> {
  const { data } = await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: context.payload.pull_request?.number!,
    body: comment,
  })

  return data.html_url
}

const formatTableRow = (link: string, docPath: string) => {
  return `| ${link} | [/${docPath}](https://github.com/vercel/next.js/blob/${sha}/${docPath}) | \n`
}

async function createCommitStatus(
  errorsExist: boolean,
  commentUrl?: string
): Promise<void> {
  const state = errorsExist ? 'failure' : 'success'
  const description = errorsExist
    ? 'This PR introduces broken links to the docs. Click details for a list.'
    : 'All broken links are now fixed, thank you!'

  await octokit.rest.repos.createCommitStatus({
    owner,
    repo,
    sha,
    state,
    description,
    context: 'Link Validation',
    target_url: commentUrl,
  })
}

// Main function that triggers link validation across all .mdx files
async function validateAllInternalLinks(): Promise<void> {
  const mdxFilePaths = await getMdxFiles('.' + DOCS_PATH)

  documentMap = new Map(
    await Promise.all(mdxFilePaths.map(prepareDocumentMapEntry))
  )

  const docProcessingPromises = Array.from(documentMap.values()).map(
    async (doc) => {
      const tree = (await markdownProcessor.process(doc.body)).contents
      return traverseTreeAndValidateLinks(tree, doc)
    }
  )

  const allErrors = await Promise.all(docProcessingPromises)

  let errorComment =
    'Hi there :wave:\n\nIt looks like this PR introduces broken links to the docs, please take a moment to fix them before merging:\n\n| :heavy_multiplication_x: Broken link | :page_facing_up: File | \n| ----------- | ----------- | \n'

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
        errorComment += formatTableRow(link, docPath)
      })
    }

    if (brokenHashes.length > 0) {
      brokenHashes.forEach((hash) => {
        errorComment += formatTableRow(hash, docPath)
      })
    }

    if (brokenSourceLinks.length > 0) {
      brokenSourceLinks.forEach((link) => {
        errorComment += formatTableRow(link, docPath)
      })
    }

    if (brokenRelatedLinks.length > 0) {
      brokenRelatedLinks.forEach((link) => {
        errorComment += formatTableRow(link, docPath)
      })
    }
  })

  errorComment += '\nThank you :pray:'

  const errorsExist = allErrors.some(
    (errors) =>
      errors.brokenLinks.length > 0 ||
      errors.brokenHashes.length > 0 ||
      errors.brokenSourceLinks.length > 0 ||
      errors.brokenRelatedLinks.length > 0
  )

  const botComment = await findBotComment()

  let commentUrl

  if (errorsExist) {
    const comment = `${COMMENT_TAG}\n${errorComment}`
    if (botComment) {
      commentUrl = await updateComment(comment, botComment)
    } else {
      commentUrl = await createComment(comment)
    }
  } else {
    const comment = `${COMMENT_TAG}\nAll broken links are now fixed, thank you!`
    if (botComment) {
      commentUrl = await updateComment(comment, botComment)
    } else {
      commentUrl = await createComment(comment)
    }
  }

  console.log({ commentUrl, errorsExist, errorComment })

  try {
    await createCommitStatus(errorsExist, commentUrl)
  } catch (error) {
    console.error('Failed to create commit status: ', error)
  }
}

validateAllInternalLinks()
