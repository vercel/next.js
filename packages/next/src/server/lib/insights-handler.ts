import fsPromises from 'fs/promises'
import { join, dirname } from 'path'
import { SourceMapConsumer } from 'next/dist/compiled/source-map08'

type StackFrame = {
  functionName: string
  fileName: string
  lineNumber: number
  columnNumber: number
  raw: string
}

type FetchEvent = {
  id: number
  url: string
  startTime: number
  endTime: number
  artificialDelay: number
  stackTrace: string
  parsedFrames: StackFrame[]
}

type CommitEvent = {
  time: number
}

type InsightsReport = {
  pageUrl: string
  timestamp: number
  fetchEvents: FetchEvent[]
  commitEvents: CommitEvent[]
}

type FetchNode = {
  fetch: FetchEvent
  children: FetchNode[]
  isParallelGroup: boolean // true if this node represents multiple parallel fetches
  parallelFetches?: FetchEvent[] // if isParallelGroup, this contains all parallel fetches
}

/**
 * Resolve a stack frame's source location using source maps
 */
export async function resolveSourceMapFrame(
  frame: StackFrame,
  pageUrl: string,
  distDir: string,
  projectDir: string
): Promise<StackFrame> {
  try {
    // Extract the path from URLs like http://localhost:3000/_next/static/chunks/app/page-abc.js
    const url = new URL(frame.fileName, pageUrl)
    const pathname = url.pathname

    // Check if this is a Next.js chunk
    if (!pathname.includes('/_next/')) {
      return frame
    }

    // Convert URL path to file path: /_next/static/chunks/... -> .next/static/chunks/...
    const relativePath = pathname.replace('/_next/', '')
    const filePath = join(distDir, relativePath)

    // Read the source file to find source map URL
    let fileContents: string
    try {
      fileContents = await fsPromises.readFile(filePath, 'utf-8')
    } catch {
      return frame
    }

    // Find source map URL in file
    const sourceMapMatch = fileContents.match(
      /\/\/[#@] ?sourceMappingURL=([^\s'"]+)\s*$/m
    )
    if (!sourceMapMatch) {
      return frame
    }

    const sourceMapUrl = sourceMapMatch[1]
    let sourceMapContent: string

    if (sourceMapUrl.startsWith('data:')) {
      // Inline source map
      const base64Match = sourceMapUrl.match(
        /^data:application\/json;(?:charset=utf-8;)?base64,(.+)$/
      )
      if (!base64Match) {
        return frame
      }
      sourceMapContent = Buffer.from(base64Match[1], 'base64').toString('utf-8')
    } else {
      // External source map file
      const sourceMapPath = join(dirname(filePath), sourceMapUrl)
      try {
        sourceMapContent = await fsPromises.readFile(sourceMapPath, 'utf-8')
      } catch {
        return frame
      }
    }

    const sourceMap = JSON.parse(sourceMapContent)
    const consumer = await new SourceMapConsumer(sourceMap)

    try {
      const original = consumer.originalPositionFor({
        line: frame.lineNumber,
        column: frame.columnNumber,
      })

      if (original.source) {
        // Convert source paths to absolute file paths
        // Uses same patterns as hot-reloader-turbopack.ts and webpack-module-path.ts
        let resolvedFileName = original.source

        // Turbopack: turbopack:///[project]/path/to/file.tsx -> /absolute/path/to/file.tsx
        // Same pattern as hot-reloader-turbopack.ts:162
        resolvedFileName = resolvedFileName.replace(
          /turbopack:\/\/\/\[project\]/,
          projectDir
        )

        // Webpack: webpack://app/./path -> ./path, webpack://_N_E/./path -> ./path
        // Same pattern as webpack-module-path.ts
        resolvedFileName = resolvedFileName
          .replace(/^webpack-internal:\/\/\/(\([\w-]+\)\/)?/, '')
          .replace(/^(webpack:\/\/\/|webpack:\/\/(_N_E\/)?)(\([\w-]+\)\/)?/, '')

        // Convert relative paths to absolute
        if (resolvedFileName.startsWith('./')) {
          resolvedFileName = join(projectDir, resolvedFileName.slice(2))
        }

        return {
          functionName: original.name || frame.functionName,
          fileName: resolvedFileName,
          lineNumber: original.line || frame.lineNumber,
          columnNumber: original.column || frame.columnNumber,
          raw: frame.raw,
        }
      }
    } finally {
      consumer.destroy()
    }
  } catch {
    // Return original frame on any error
  }
  return frame
}

/**
 * Filter stack frames to show only user code (exclude node_modules, Next.js internals, etc.)
 */
function filterUserFrames(frames: StackFrame[]): StackFrame[] {
  const excludePatterns = [
    'node_modules',
    'patchedFetch',
    'waterfall-detector',
    'webpack-internal',
    'turbopack-internal',
    '_next/static/chunks',
    'react-dom',
    'scheduler',
    'next/dist',
  ]

  return frames.filter((frame) => {
    // Skip frames without fileName
    if (!frame.fileName) return false
    const combined = `${frame.fileName} ${frame.functionName}`
    return !excludePatterns.some((pattern) => combined.includes(pattern))
  })
}

/**
 * Handle insights waterfall detection report from the client.
 * Receives raw timing data and performs all analysis server-side.
 */
export async function handleInsightsReport(
  report: InsightsReport,
  distDir: string,
  projectDir: string,
  cacheComponents: boolean = false
): Promise<void> {
  const route = new URL(report.pageUrl).pathname
  const debug =
    new URL(report.pageUrl).searchParams.has('__debug_waterfall') ||
    process.env.DEBUG_WATERFALL === '1'

  // Configuration for analysis
  const PROXIMITY_THRESHOLD = 100 // ms to consider events causally related
  const PARALLEL_THRESHOLD = 50 // ms - fetches starting within this time are considered parallel

  // Resolve source maps for all fetch frames
  for (const fetchEvent of report.fetchEvents) {
    for (let i = 0; i < fetchEvent.parsedFrames.length; i++) {
      fetchEvent.parsedFrames[i] = await resolveSourceMapFrame(
        fetchEvent.parsedFrames[i],
        report.pageUrl,
        distDir,
        projectDir
      )
    }
  }

  // Helper to get location string from frames
  const getLocation = (parsedFrames: StackFrame[]) => {
    const topFrame = filterUserFrames(parsedFrames || [])[0]
    if (!topFrame) return 'unknown location'
    let filePath = topFrame.fileName
    if (filePath.startsWith(projectDir)) {
      filePath = filePath.slice(projectDir.length)
      if (filePath.startsWith('/')) {
        filePath = filePath.slice(1)
      }
    }
    return `${filePath}:${topFrame.lineNumber}`
  }

  // No fetches - nothing to analyze
  if (report.fetchEvents.length === 0) {
    console.log(`✅ No waterfall detected on ${route} (no client fetches)`)
    return
  }

  // Debug: Print raw data
  if (debug) {
    console.log('')
    console.log('═'.repeat(80))
    console.log(`WATERFALL DETECTION DEBUG for ${route}`)
    console.log('═'.repeat(80))
    console.log('')
    console.log('Configuration:')
    console.log(`  PROXIMITY_THRESHOLD: ${PROXIMITY_THRESHOLD}ms`)
    console.log(`  PARALLEL_THRESHOLD: ${PARALLEL_THRESHOLD}ms`)
    console.log('')
    console.log('Raw Fetch Events:')
    report.fetchEvents.forEach((f) => {
      console.log(
        `  [${f.id}] ${f.url} | start: ${f.startTime.toFixed(1)}ms | end: ${f.endTime.toFixed(1)}ms | delay: ${f.artificialDelay}ms`
      )
    })
    console.log('')
    console.log('Raw Commit Events:')
    report.commitEvents.forEach((c, i) => {
      console.log(`  [${i}] time: ${c.time.toFixed(1)}ms`)
    })
    console.log('')
  }

  // Step 1: Identify fetches that triggered a React commit
  // (fetch.endTime → commit.time within threshold)
  const fetchesWithCommits = new Set<number>()
  for (const fetchEvent of report.fetchEvents) {
    const hasRelatedCommit = report.commitEvents.some(
      (commit) =>
        commit.time >= fetchEvent.endTime &&
        commit.time - fetchEvent.endTime <= PROXIMITY_THRESHOLD
    )
    if (hasRelatedCommit) {
      fetchesWithCommits.add(fetchEvent.id)
    }
  }

  // Step 2: Group fetches into parallel batches
  // Fetches starting within PARALLEL_THRESHOLD of each other are parallel
  type FetchBatch = typeof report.fetchEvents
  const fetchBatches: FetchBatch[] = []
  let currentBatch: FetchBatch = []

  for (const f of report.fetchEvents) {
    if (
      currentBatch.length === 0 ||
      f.startTime - currentBatch[0].startTime <= PARALLEL_THRESHOLD
    ) {
      currentBatch.push(f)
    } else {
      fetchBatches.push(currentBatch)
      currentBatch = [f]
    }
  }
  if (currentBatch.length > 0) {
    fetchBatches.push(currentBatch)
  }

  // Map fetch id to batch index
  const fetchToBatch = new Map<number, number>()
  for (let batchIdx = 0; batchIdx < fetchBatches.length; batchIdx++) {
    for (const f of fetchBatches[batchIdx]) {
      fetchToBatch.set(f.id, batchIdx)
    }
  }

  if (debug) {
    console.log('Fetch Batches (parallel groups):')
    fetchBatches.forEach((batch, i) => {
      const urls = batch.map((f) => f.url).join(', ')
      console.log(`  Batch ${i}: ${batch.length} fetch(es) - ${urls}`)
    })
    console.log('')
    console.log(
      'Fetches that triggered commits:',
      Array.from(fetchesWithCommits)
    )
    console.log('')
  }

  // Step 3: Build waterfall tree
  // Build a tree where each node represents fetches, and edges represent causal relationships
  const processedFetchIds = new Set<number>()
  const rootNodes: FetchNode[] = []

  // Helper: Find all fetches triggered by a given fetch's commit
  const findTriggeredFetches = (
    fetchEndTime: number,
    currentBatchIdx: number
  ): FetchEvent[] => {
    // Find a commit shortly after this fetch ended
    const relatedCommit = report.commitEvents.find(
      (c) =>
        c.time >= fetchEndTime && c.time - fetchEndTime <= PROXIMITY_THRESHOLD
    )
    if (!relatedCommit) return []

    // Find ALL fetches that started shortly after that commit, from LATER batches
    const triggeredFetches = report.fetchEvents.filter((f) => {
      const fBatchIdx = fetchToBatch.get(f.id)!
      return (
        !processedFetchIds.has(f.id) &&
        fBatchIdx > currentBatchIdx &&
        f.startTime >= relatedCommit.time &&
        f.startTime - relatedCommit.time <= PROXIMITY_THRESHOLD
      )
    })

    return triggeredFetches
  }

  // Recursive function to build tree from a fetch
  const buildTree = (fetchEvent: FetchEvent): FetchNode => {
    processedFetchIds.add(fetchEvent.id)
    const node: FetchNode = {
      fetch: fetchEvent,
      children: [],
      isParallelGroup: false,
    }

    const batchIdx = fetchToBatch.get(fetchEvent.id)!
    const triggeredFetches = findTriggeredFetches(fetchEvent.endTime, batchIdx)

    if (triggeredFetches.length > 0) {
      // Check if triggered fetches are parallel (all in same batch)
      const triggeredBatches = new Set(
        triggeredFetches.map((f) => fetchToBatch.get(f.id)!)
      )
      if (triggeredBatches.size === 1 && triggeredFetches.length > 1) {
        // Parallel group - create a single node representing all
        const parallelNode: FetchNode = {
          fetch: triggeredFetches[0], // Use first as representative
          children: [],
          isParallelGroup: true,
          parallelFetches: triggeredFetches,
        }
        triggeredFetches.forEach((f) => processedFetchIds.add(f.id))

        // Recursively build children from each parallel fetch
        triggeredFetches.forEach((f) => {
          const childBatchIdx = fetchToBatch.get(f.id)!
          const childTriggered = findTriggeredFetches(f.endTime, childBatchIdx)
          childTriggered.forEach((cf) => {
            if (!processedFetchIds.has(cf.id)) {
              parallelNode.children.push(buildTree(cf))
            }
          })
        })

        node.children.push(parallelNode)
      } else {
        // Serial or mixed - create separate branches
        triggeredFetches.forEach((f) => {
          if (!processedFetchIds.has(f.id)) {
            node.children.push(buildTree(f))
          }
        })
      }
    }

    return node
  }

  // Build trees starting from initial batch fetches that triggered commits
  const initialBatch = fetchBatches[0]
  for (const fetchEvent of initialBatch) {
    if (fetchesWithCommits.has(fetchEvent.id)) {
      rootNodes.push(buildTree(fetchEvent))
    }
  }

  // Waterfall detection: ANY client-side fetch is considered a waterfall
  // (root) -> fetch1 is a waterfall (should be on server)
  // (root) with no fetches is not a waterfall
  const treeHasWaterfall = rootNodes.length > 0

  if (debug) {
    console.log('Detected Waterfall Tree:')
    if (rootNodes.length === 0 || !treeHasWaterfall) {
      console.log('  (none)')
    } else {
      const printTree = (node: FetchNode, indent: string = '  ') => {
        if (node.isParallelGroup && node.parallelFetches) {
          console.log(
            `${indent}[Parallel Group: ${node.parallelFetches.length} fetches]`
          )
          node.parallelFetches.forEach((f) => {
            console.log(`${indent}  - [${f.id}] ${f.url}`)
          })
        } else {
          console.log(`${indent}[${node.fetch.id}] ${node.fetch.url}`)
        }
        node.children.forEach((child) => printTree(child, indent + '  '))
      }
      rootNodes.forEach((root, i) => {
        console.log(`  Tree ${i + 1}:`)
        printTree(root, '    ')
      })
    }
    console.log('')
    console.log('═'.repeat(80))
    console.log('')
  }

  // Step 4: Determine result and output
  const parallelBatches = fetchBatches.filter((b) => b.length > 1)
  const hasParallelBatches = parallelBatches.length > 0

  // No waterfall detected
  if (!treeHasWaterfall) {
    if (hasParallelBatches) {
      console.log(`✅ No waterfall detected on ${route}`)
      parallelBatches.forEach((batch, i) => {
        console.log(`   Parallel fetch group ${i + 1}:`)
        batch.forEach((f) => {
          const location = getLocation(f.parsedFrames)
          console.log(`     - ${f.url}`)
          console.log(`       at ${location}`)
        })
      })
    } else {
      console.log(`✅ No waterfall detected on ${route}`)
    }
    return
  }

  // Waterfall detected - detailed output
  console.log('')
  console.log('═'.repeat(80))
  console.log(`🚨 WATERFALL DETECTED on ${route}`)
  console.log('═'.repeat(80))
  console.log('')

  // Recursive function to print tree with proper formatting
  const printTreeOutput = (
    node: FetchNode,
    depth: number = 0,
    prefix: string = ''
  ) => {
    if (node.isParallelGroup && node.parallelFetches) {
      // Parallel group
      if (depth > 0) console.log(`${prefix}↓`)
      node.parallelFetches.forEach((f, idx) => {
        const location = getLocation(f.parsedFrames)
        const isLast = idx === node.parallelFetches!.length - 1
        const bullet = node.parallelFetches!.length > 1 ? '├─' : '└─'
        console.log(`${prefix}${isLast ? '└─' : bullet} ${f.url} (${location})`)
      })
    } else {
      // Single fetch
      if (depth > 0) console.log(`${prefix}↓`)
      const location = getLocation(node.fetch.parsedFrames)
      console.log(`${prefix}└─ ${node.fetch.url} (${location})`)
    }

    // Print children
    if (node.children.length > 0) {
      const childPrefix = prefix + '   '
      node.children.forEach((child) => {
        printTreeOutput(child, depth + 1, childPrefix)
      })
    }
  }

  rootNodes.forEach((root, idx) => {
    if (rootNodes.length > 1 && idx > 0) {
      console.log('')
      console.log('─'.repeat(80))
      console.log('')
    }
    if (rootNodes.length > 1) {
      console.log(`Path ${idx + 1}:`)
    }
    printTreeOutput(root)
  })

  // Calculate severity
  const getTotalDepth = (node: FetchNode): number => {
    if (node.children.length === 0) return 1
    return 1 + Math.max(...node.children.map(getTotalDepth))
  }

  const maxDepth = Math.max(...rootNodes.map(getTotalDepth))
  const totalFetches = report.fetchEvents.length

  // Count parallel vs serial
  const countParallel = (node: FetchNode): number => {
    let count = 0
    if (node.isParallelGroup && node.parallelFetches) {
      count += node.parallelFetches.length - 1 // Extra parallel fetches
    }
    node.children.forEach((child) => (count += countParallel(child)))
    return count
  }
  const parallelCount = rootNodes.reduce(
    (sum, node) => sum + countParallel(node),
    0
  )

  // Severity: CRITICAL (depth >= 4), HIGH (depth 3), MEDIUM (depth 2), LOW (depth 1 with children)
  let severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW'
  if (maxDepth >= 4) severity = 'CRITICAL'
  else if (maxDepth === 3) severity = 'HIGH'
  else if (maxDepth === 2) severity = 'MEDIUM'

  const severityEmoji = {
    CRITICAL: '🔴',
    HIGH: '🟠',
    MEDIUM: '🟡',
    LOW: '🟢',
  }

  // Generate different prompts based on cacheComponents config
  let aiInsights: string

  if (!cacheComponents) {
    // When cache components are NOT enabled, add force-dynamic directive
    aiInsights = `
${'─'.repeat(80)}

${severityEmoji[severity]} Severity: ${severity}
   Waterfall depth: ${maxDepth} level(s)
   Total fetches: ${totalFetches} (${parallelCount} parallel, ${totalFetches - parallelCount} serial)

PROBLEM:
  Client components fetch sequentially: fetch completes → commit → re-render → next fetch.
  Each level adds network latency to Time To Interactive.

CAUSE:
  Client components can only fetch after mounting. Dependent fetches wait for
  the full React commit cycle.

FIX: Use Server Components with force-dynamic

EXAMPLE:

  // BEFORE: Client Component Waterfall (❌ SLOW)
  'use client'
  function UserProfile({ userId }) {
    const [user, setUser] = useState(null)
    const [posts, setPosts] = useState(null)

    useEffect(() => {
      fetch(\`/api/user/\${userId}\`).then(r => r.json()).then(setUser)
    }, [userId])

    useEffect(() => {
      if (user) { // ⚠️  Must wait for user before fetching posts
        fetch(\`/api/posts?userId=\${user.id}\`).then(r => r.json()).then(setPosts)
      }
    }, [user])

    if (!user) return <Skeleton />
    return (
      <div>
        <h1>{user.name}</h1>  {/* Static after user loads */}
        <Bio bio={user.bio} />  {/* Static after user loads */}
        {!posts ? <Spinner /> : <PostList posts={posts} />}
      </div>
    )
  }

  // AFTER: Server Component with force-dynamic (✅ FAST)
  // app/user/[userId]/page.tsx

  // Add this directive at the top of the file to ensure dynamic rendering
  export const dynamic = 'force-dynamic';

  export default async function UserPage({ params }) {
    const userPromise = fetch(\`/api/user/\${params.userId}\`)
      .then(r => r.json())

    // Chain dependent data
    const postsPromise = userPromise.then(user =>
      fetch(\`/api/posts?userId=\${user.id}\`).then(r => r.json())
    )

    return (
      <div>
        <Header />
        <Suspense fallback={<Skeleton />}>
          <UserProfile userPromise={userPromise} postsPromise={postsPromise} />
        </Suspense>
      </div>
    )
  }

  async function UserProfile({ userPromise, postsPromise }) {
    const user = await userPromise

    return (
      <div>
        <h1>{user.name}</h1>
        <Bio bio={user.bio} />
        <Suspense fallback={<Spinner />}>
          <PostList postsPromise={postsPromise} />
        </Suspense>
      </div>
    )
  }

  async function PostList({ postsPromise }) {
    const posts = await postsPromise
    return posts.map(post => <Post key={post.id} post={post} />)
  }

IMPORTANT: When migrating to Server Components without cache components enabled:
  - Add \`export const dynamic = 'force-dynamic';\` at the top of your page file
  - This makes all fetches dynamic by default, so no need for \`{ cache: 'no-store' }\`

If you need client interactivity, fetch on server and pass promises:

  // Server component
  export const dynamic = 'force-dynamic';

  export default function UserPage({ params }) {
    const userPromise = fetch(\`/api/user/\${params.userId}\`).then(r => r.json())
    const postsPromise = userPromise.then(user =>
      fetch(\`/api/posts?userId=\${user.id}\`).then(r => r.json())
    )
    return <ClientProfile userPromise={userPromise} postsPromise={postsPromise} />
  }

  'use client'
  import { use } from 'react'

  export function ClientProfile({ userPromise, postsPromise }) {
    const user = use(userPromise)
    const [expanded, setExpanded] = useState(false)
    return (
      <div>
        <h1 onClick={() => setExpanded(!expanded)}>{user.name}</h1>
        {expanded && <Bio bio={user.bio} />}
        <Suspense fallback={<Spinner />}>
          <Posts postsPromise={postsPromise} />
        </Suspense>
      </div>
    )
  }

${'═'.repeat(80)}
`
  } else {
    // When cache components ARE enabled, ensure top-level prerendering capability
    aiInsights = `
${'─'.repeat(80)}

${severityEmoji[severity]} Severity: ${severity}
   Waterfall depth: ${maxDepth} level(s)
   Total fetches: ${totalFetches} (${parallelCount} parallel, ${totalFetches - parallelCount} serial)

PROBLEM:
  Client components fetch sequentially: fetch completes → commit → re-render → next fetch.
  Each level adds network latency to Time To Interactive.

CAUSE:
  Client components can only fetch after mounting. Dependent fetches wait for
  the full React commit cycle.

FIX: Use Server Components with Cache Components

With cache components enabled, you can optimize by moving data fetching to the server
and ensuring the top-level of your page can be prerendered.

EXAMPLE:

  // BEFORE: Client Component Waterfall (❌ SLOW)
  'use client'
  function UserProfile({ userId }) {
    const [user, setUser] = useState(null)
    const [posts, setPosts] = useState(null)

    useEffect(() => {
      fetch(\`/api/user/\${userId}\`).then(r => r.json()).then(setUser)
    }, [userId])

    useEffect(() => {
      if (user) { // ⚠️  Must wait for user before fetching posts
        fetch(\`/api/posts?userId=\${user.id}\`).then(r => r.json()).then(setPosts)
      }
    }, [user])

    if (!user) return <Skeleton />
    return (
      <div>
        <h1>{user.name}</h1>  {/* Static after user loads */}
        <Bio bio={user.bio} />  {/* Static after user loads */}
        {!posts ? <Spinner /> : <PostList posts={posts} />}
      </div>
    )
  }

  // AFTER: Server Component with Cache Components (✅ FAST)
  // app/user/[userId]/page.tsx
  export default async function UserPage({ params }) {
    // These will be cached by default with cache components enabled
    const userPromise = fetch(\`/api/user/\${params.userId}\`)
      .then(r => r.json())

    // Chain dependent data
    const postsPromise = userPromise.then(user =>
      fetch(\`/api/posts?userId=\${user.id}\`).then(r => r.json())
    )

    return (
      <div>
        {/* Top-level content without I/O - enables prerendering */}
        <Header />
        <StaticSidebar />

        {/* Dynamic content in Suspense boundaries */}
        <Suspense fallback={<Skeleton />}>
          <UserProfile userPromise={userPromise} postsPromise={postsPromise} />
        </Suspense>
      </div>
    )
  }

  async function UserProfile({ userPromise, postsPromise }) {
    const user = await userPromise

    return (
      <div>
        <h1>{user.name}</h1>
        <Bio bio={user.bio} />
        <Suspense fallback={<Spinner />}>
          <PostList postsPromise={postsPromise} />
        </Suspense>
      </div>
    )
  }

  async function PostList({ postsPromise }) {
    const posts = await postsPromise
    return posts.map(post => <Post key={post.id} post={post} />)
  }

IMPORTANT: With cache components enabled:
  1. After removing all Suspense boundaries, the remaining shell must be synchronously renderable
  2. This means NO async/await outside Suspense - the static shell cannot wait for I/O
  3. All async data fetching must happen inside components wrapped by Suspense
  4. The static shell can only contain: JSX, props, synchronous computations

BAD (no static shell - blocks on I/O):
  export default async function Page() {
    const data = await fetch('/api/data').then(r => r.json()) // ❌ await blocks rendering
    return (
      <div>
        <Header />
        <div>{data.content}</div>
      </div>
    )
  }

ALSO BAD (async but no Suspense boundary):
  export default function Page() {
    const dataPromise = fetch('/api/data').then(r => r.json())

    return (
      <div>
        <Header />
        <DynamicContent dataPromise={dataPromise} /> {/* ❌ No Suspense boundary */}
      </div>
    )
  }

GOOD (static shell with Suspense for async content):
  export default function Page() {
    return (
      <div>
        <Header /> {/* ✅ Static shell - renders immediately */}
        <Navigation />
        <Suspense fallback={<Loading />}>
          <DynamicContent /> {/* Async content inside Suspense */}
        </Suspense>
      </div>
    )
  }

  async function DynamicContent() {
    const data = await fetch('/api/data').then(r => r.json())
    return <div>{data.content}</div>
  }

If you need client interactivity, fetch on server and pass promises:

  // Server component
  export default function UserPage({ params }) {
    const userPromise = fetch(\`/api/user/\${params.userId}\`).then(r => r.json())
    const postsPromise = userPromise.then(user =>
      fetch(\`/api/posts?userId=\${user.id}\`).then(r => r.json())
    )

    return (
      <div>
        <StaticHeader /> {/* ✅ Static top-level content */}
        <ClientProfile userPromise={userPromise} postsPromise={postsPromise} />
      </div>
    )
  }

  'use client'
  import { use } from 'react'

  export function ClientProfile({ userPromise, postsPromise }) {
    const user = use(userPromise)
    const [expanded, setExpanded] = useState(false)
    return (
      <div>
        <h1 onClick={() => setExpanded(!expanded)}>{user.name}</h1>
        {expanded && <Bio bio={user.bio} />}
        <Suspense fallback={<Spinner />}>
          <Posts postsPromise={postsPromise} />
        </Suspense>
      </div>
    )
  }

${'═'.repeat(80)}
`
  }

  console.log(aiInsights)
}
