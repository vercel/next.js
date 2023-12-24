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
import { setFailed } from '@actions/core'

/**
 * This script validates internal links in /docs and /errors including internal,
 * hash, source and related links. It does not validate external links.
 * 1. Collects all .mdx files in /docs and /errors.
 * 2. For each file, it extracts the content, metadata, and heading slugs.
 * 3. It creates a document map to efficiently lookup documents by path.
 * 4. It then traverses each document modified in the PR and...
 *    - Checks if each internal link (links starting with "/docs/") points
 *      to an existing document
 *    - Validates hash links (links starting with "#") against the list of
 *      headings in the current document.
 *    - Checks the source and related links found in the metadata of each
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
  link: string[]
  hash: string[]
  source: string[]
  related: string[]
}

type ErrorType = Exclude<keyof Errors, 'doc'>

interface Comment {
  id: number
}

const DOCS_PATH = '/docs/'
const ERRORS_PATH = '/errors/'
const EXCLUDED_HASHES = ['top']
const COMMENT_TAG = '<!-- LINK_CHECKER_COMMENT -->'

const { context, getOctokit } = github
const octokit = getOctokit(process.env.GITHUB_TOKEN!)
const { owner, repo } = context.repo
const pullRequest = context.payload.pull_request
if (!pullRequest) {
  console.log('Skipping since this is not a pull request')
  process.exit(0)
}
const sha = pullRequest.head.sha
const isFork = pullRequest.head.repo.fork
const prNumber = pullRequest.number

const slugger = new GithubSlugger()

// Collect the paths of all .mdx files in the passed directories
async function getAllMdxFilePaths(
  directoriesToScan: string[],
  fileList: string[] = []
): Promise<string[]> {
  for (const dir of directoriesToScan) {
    const dirPath = path.join('.', dir)
    const files = await fs.readdir(dirPath)
    for (const file of files) {
      const filePath = path.join(dirPath, file)
      const stats = await fs.stat(filePath)
      if (stats.isDirectory()) {
        fileList = await getAllMdxFilePaths([filePath], fileList)
      } else if (path.extname(file) === '.mdx') {
        fileList.push(filePath)
      }
    }
  }

  return fileList
}

// Returns the slugs of all headings in a tree
function getHeadingsFromMarkdownTree(
  tree: ReturnType<typeof markdownProcessor.parse>
): string[] {
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

// Github APIs returns `errors/*` and `docs/*` paths
function normalizePath(filePath: string): string {
  if (filePath.startsWith(ERRORS_PATH.substring(1))) {
    return (
      filePath
        // Remap repository file path to the next-site url path
        // e.g. `errors/example.mdx` -> `docs/messages/example`
        .replace(ERRORS_PATH.substring(1), DOCS_PATH.substring(1) + 'messages/')
        .replace('.mdx', '')
    )
  }

  return (
    // Remap repository file path to the next-site url path without `/docs/`
    // e.g. `docs/01-api/getting-started/index.mdx` -> `api/getting-started`
    filePath
      // We remove `docs/` to normalize paths between regular links
      // e.g. `/docs/api/example` and related/source links e.g `api/example`
      // TODO:
      //  - Fix `next-site` to handle full paths for related/source links
      //  - Update doc files to use full paths for related/source links
      //  - Remove this workaround
      .replace(DOCS_PATH.substring(1), '')
      // Remove prefix numbers used for ordering
      .replace(/(\d\d-)/g, '')
      .replace('.mdx', '')
      .replace('/index', '')
  )
}

// use Map for faster lookup
let documentMap: Map<string, Document>

// Create a map of documents with their paths as keys and
// document content and metadata as values
// The key varies between doc pages and error pages
// error pages: `/docs/messages/example`
// doc pages: `api/example`
async function prepareDocumentMapEntry(
  filePath: string
): Promise<[string, Document]> {
  try {
    const mdxContent = await fs.readFile(filePath, 'utf8')
    const { content, data } = matter(mdxContent)
    const tree = markdownProcessor.parse(content)
    const headings = getHeadingsFromMarkdownTree(tree)
    const normalizedUrlPath = normalizePath(filePath)

    return [
      normalizedUrlPath,
      { body: content, path: filePath, headings, ...data },
    ]
  } catch (error) {
    setFailed(`Error preparing document map for file ${filePath}: ${error}`)
    return ['', {} as Document]
  }
}

// Checks if the links point to existing documents
function validateInternalLink(errors: Errors, href: string): void {
  // /docs/api/example#heading -> ["api/example", "heading""]
  const [link, hash] = href.replace(DOCS_PATH, '').split('#', 2)

  let foundPage

  if (link.startsWith('messages/')) {
    // check if error page exists, key is the full url path
    // e.g. `docs/messages/example`
    foundPage = documentMap.get(DOCS_PATH.substring(1) + link)
  } else {
    // check if doc page exists, key is the url path without `/docs/`
    // e.g. `api/example`
    foundPage = documentMap.get(link)
  }

  if (!foundPage) {
    errors.link.push(href)
  } else if (hash && !EXCLUDED_HASHES.includes(hash)) {
    // Account for documents that pull their content from another document
    const foundPageSource = foundPage.source
      ? documentMap.get(foundPage.source)
      : undefined

    // Check if the hash link points to an existing section within the document
    const hashFound = (foundPageSource || foundPage).headings.includes(hash)

    if (!hashFound) {
      errors.hash.push(href)
    }
  }
}

// Checks if the hash links point to existing sections within the same document
function validateHashLink(errors: Errors, href: string, doc: Document): void {
  const hashLink = href.replace('#', '')

  if (!EXCLUDED_HASHES.includes(hashLink) && !doc.headings.includes(hashLink)) {
    errors.hash.push(href)
  }
}

// Checks if the source link points to an existing document
function validateSourceLinks(doc: Document, errors: Errors): void {
  if (doc.source && !documentMap.get(doc.source)) {
    errors.source.push(doc.source)
  }
}

// Checks if the related links point to existing documents
function validateRelatedLinks(doc: Document, errors: Errors): void {
  if (doc.related && doc.related.links) {
    doc.related.links.forEach((link) => {
      if (!documentMap.get(link)) {
        errors.related.push(link)
      }
    })
  }
}

// Traverse the document tree and validate links
function traverseTreeAndValidateLinks(tree: any, doc: Document): Errors {
  const errors: Errors = {
    doc,
    link: [],
    hash: [],
    source: [],
    related: [],
  }

  try {
    visit(tree, (node: any) => {
      if (node.type === 'element' && node.tagName === 'a') {
        const href = node.properties.href

        if (!href) return

        if (href.startsWith(DOCS_PATH)) {
          validateInternalLink(errors, href)
        } else if (href.startsWith('#')) {
          validateHashLink(errors, href, doc)
        }
      }
    })

    validateSourceLinks(doc, errors)
    validateRelatedLinks(doc, errors)
  } catch (error) {
    setFailed('Error traversing tree: ' + error)
  }

  return errors
}

async function findBotComment(): Promise<Comment | undefined> {
  try {
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
    })

    return comments.find((c) => c.body?.includes(COMMENT_TAG))
  } catch (error) {
    setFailed('Error finding bot comment: ' + error)
    return undefined
  }
}

async function updateComment(
  comment: string,
  botComment: Comment
): Promise<string> {
  try {
    const { data } = await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: botComment.id,
      body: comment,
    })

    return data.html_url
  } catch (error) {
    setFailed('Error updating comment: ' + error)
    return ''
  }
}

async function createComment(comment: string): Promise<string> {
  if (isFork) {
    setFailed(
      'The action could not create a Github comment because it is initiated from a forked repo. View the action logs for a list of broken links.'
    )

    return ''
  } else {
    try {
      const { data } = await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: comment,
      })

      return data.html_url
    } catch (error) {
      setFailed('Error creating comment: ' + error)
      return ''
    }
  }
}

const formatTableRow = (
  link: string,
  errorType: ErrorType,
  docPath: string
) => {
  return `| ${link} | ${errorType} | [/${docPath}](https://github.com/vercel/next.js/blob/${sha}/${docPath}) | \n`
}

async function updateCheckStatus(
  errorsExist: boolean,
  commentUrl?: string
): Promise<void> {
  const checkName = 'Docs Link Validation'

  let summary, text

  if (errorsExist) {
    summary =
      'This PR introduces broken links to the docs. Click details for a list.'
    text = `[See the comment for details](${commentUrl})`
  } else {
    summary = 'No broken links found'
  }

  const checkParams = {
    owner,
    repo,
    name: checkName,
    head_sha: sha,
    status: 'completed',
    conclusion: errorsExist ? 'failure' : 'success',
    output: {
      title: checkName,
      summary: summary,
      text: text,
    },
  }

  if (isFork) {
    if (errorsExist) {
      setFailed(
        'This PR introduces broken links to the docs. The action could not create a Github check because it is initiated from a forked repo.'
      )
    } else {
      console.log('Link validation was successful.')
    }
  } else {
    try {
      await octokit.rest.checks.create(checkParams)
    } catch (error) {
      setFailed('Failed to create check: ' + error)
    }
  }
}

// Main function that triggers link validation across .mdx files
async function validateAllInternalLinks(): Promise<void> {
  try {
    const allMdxFilePaths = await getAllMdxFilePaths([DOCS_PATH, ERRORS_PATH])

    documentMap = new Map(
      await Promise.all(allMdxFilePaths.map(prepareDocumentMapEntry))
    )

    const docProcessingPromises = allMdxFilePaths.map(async (filePath) => {
      const doc = documentMap.get(normalizePath(filePath))
      if (doc) {
        const tree = (await markdownProcessor.process(doc.body)).contents
        return traverseTreeAndValidateLinks(tree, doc)
      } else {
        return {
          doc: {} as Document,
          link: [],
          hash: [],
          source: [],
          related: [],
        } as Errors
      }
    })

    const allErrors = await Promise.all(docProcessingPromises)

    let errorsExist = false

    let errorRows: string[] = []

    const errorTypes: ErrorType[] = ['link', 'hash', 'source', 'related']
    allErrors.forEach((errors) => {
      const {
        doc: { path: docPath },
      } = errors

      errorTypes.forEach((errorType) => {
        if (errors[errorType].length > 0) {
          errorsExist = true
          errors[errorType].forEach((link) => {
            errorRows.push(formatTableRow(link, errorType, docPath))
          })
        }
      })
    })

    const errorComment = [
      'Hi there :wave:\n\nIt looks like this PR introduces broken links to the docs, please take a moment to fix them before merging:\n\n| Broken link | Type | File | \n| ----------- | ----------- | ----------- | \n',
      ...errorRows,
      '\nThank you :pray:',
    ].join('')

    const botComment = await findBotComment()

    let commentUrl

    if (errorsExist) {
      const comment = `${COMMENT_TAG}\n${errorComment}`
      if (botComment) {
        commentUrl = await updateComment(comment, botComment)
      } else {
        commentUrl = await createComment(comment)
      }

      const errorTableData = allErrors.flatMap((errors) => {
        const { doc } = errors

        return errorTypes.flatMap((errorType) =>
          errors[errorType].map((link) => ({
            docPath: doc.path,
            errorType,
            link,
          }))
        )
      })

      console.log('This PR introduces broken links to the docs:')
      console.table(errorTableData, ['link', 'type', 'docPath'])
    } else if (botComment) {
      const comment = `${COMMENT_TAG}\nAll broken links are now fixed, thank you!`
      commentUrl = await updateComment(comment, botComment)
    }

    try {
      await updateCheckStatus(errorsExist, commentUrl)
    } catch (error) {
      setFailed('Failed to create Github check: ' + error)
    }
  } catch (error) {
    setFailed('Error validating internal links: ' + error)
  }
}

validateAllInternalLinks()
