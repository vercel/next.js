// Deterministic data for the bench fixtures. Everything derives from a
// seeded PRNG at module scope so every request serializes identical bytes:
// A/B payload comparisons must never see data noise.
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(0xbe9c)

// Fixed reference time so timestamps (real Date objects, like API rows
// carry) serialize identically on every request.
export const NOW = new Date('2026-07-01T12:00:00.000Z')
const minutesBefore = (m) => new Date(NOW.getTime() - m * 60000)
const pick = (arr) => arr[Math.floor(rand() * arr.length)]

const FIRST = [
  'Ada',
  'Grace',
  'Alan',
  'Edsger',
  'Barbara',
  'Donald',
  'Leslie',
  'Tony',
  'Niklaus',
  'John',
  'Frances',
  'Margaret',
]
const LAST = [
  'Lovelace',
  'Hopper',
  'Turing',
  'Dijkstra',
  'Liskov',
  'Knuth',
  'Lamport',
  'Hoare',
  'Wirth',
  'Backus',
  'Allen',
  'Hamilton',
]
const PROJECTS = [
  'storefront',
  'marketing-site',
  'docs',
  'api-gateway',
  'auth-service',
  'image-worker',
  'analytics-ingest',
  'search-index',
]
const BRANCHES = [
  'main',
  'main',
  'main',
  'staging',
  'feat/checkout-v2',
  'fix/nav-focus-trap',
  'chore/deps-bump',
  'feat/edge-cache',
  'fix/i18n-fallback',
]
const COMMITS = [
  'Fix hydration mismatch in pricing table',
  'Bump image optimizer to handle AVIF fallback',
  'Add rate limiting to webhook ingestion',
  'Refactor checkout state machine',
  'Cache product lookups at the edge',
  'Handle expired sessions in middleware',
  'Reduce bundle size of analytics client',
  'Add retry with jitter to queue consumer',
  'Migrate cron handlers to streaming responses',
  'Fix focus trap in command menu',
]
const STATUSES = [
  'ready',
  'ready',
  'ready',
  'ready',
  'building',
  'error',
  'queued',
]
const REGIONS = ['iad1', 'sfo1', 'fra1', 'hnd1', 'syd1']

export const viewer = {
  name: 'Ada Lovelace',
  email: 'ada@acme.dev',
  team: 'acme',
  plan: 'pro',
  avatarHue: 262,
}

// A small pool of people shared by reference across deployments and
// activity, like entities from a normalized API. Repeated references are
// outlined once on the wire and deduplicated.
export const people = Array.from({ length: 9 }, () => {
  const first = pick(FIRST)
  const last = pick(LAST)
  return {
    name: first + ' ' + last,
    username: (first[0] + last).toLowerCase(),
    avatarHue: Math.floor(rand() * 360),
  }
})

export const deployments = Array.from({ length: 22 }, (_, i) => {
  return {
    id:
      'dpl_' +
      (100000 + Math.floor(rand() * 899999)).toString(36) +
      i.toString(36),
    project: pick(PROJECTS),
    branch: pick(BRANCHES),
    commit: pick(COMMITS),
    sha: Array.from({ length: 5 }, () =>
      Math.floor(rand() * 0xffffffff)
        .toString(16)
        .padStart(8, '0')
    ).join(''),
    status: pick(STATUSES),
    author: people[Math.floor(rand() * people.length)],
    url:
      'https://' +
      pick(PROJECTS) +
      '-' +
      (100000 + Math.floor(rand() * 899999)).toString(36) +
      '-acme-team.vercel.app',
    inspectorUrl:
      'https://vercel.com/acme/' +
      pick(PROJECTS) +
      '/' +
      (100000 + Math.floor(rand() * 899999)).toString(36) +
      (100000 + Math.floor(rand() * 899999)).toString(36),
    createdAt: minutesBefore(Math.floor(rand() * 2880) + 2),
    // Optional fields are sparse like real API responses.
    durationSeconds: i % 4 !== 3 ? Math.floor(rand() * 340) + 18 : undefined,
    region: i % 3 !== 2 ? pick(REGIONS) : undefined,
  }
})

export const metrics = [
  {
    id: 'requests',
    label: 'Edge requests',
    value: '4.2M',
    delta: '+12.4%',
    trend: 'up',
    quota: 0.42,
  },
  {
    id: 'bandwidth',
    label: 'Bandwidth',
    value: '862 GB',
    delta: '+3.1%',
    trend: 'up',
    quota: 0.71,
  },
  {
    id: 'p75',
    label: 'TTFB p75',
    value: '184 ms',
    delta: '-9ms',
    trend: 'down',
    quota: 0.31,
  },
  {
    id: 'errors',
    label: 'Error rate',
    value: '0.04%',
    delta: '-0.01%',
    trend: 'down',
    quota: 0.08,
  },
  {
    id: 'functions',
    label: 'Function invocations',
    value: '1.9M',
    delta: '+22.0%',
    trend: 'up',
    quota: 0.63,
  },
  {
    id: 'isr',
    label: 'ISR writes',
    value: '312K',
    delta: '+1.2%',
    trend: 'flat',
    quota: 0.24,
  },
]

// 90 days of request counts for the usage chart, passed as data props.
export const usageSeries = Array.from({ length: 90 }, (_, i) => ({
  day: i,
  date: minutesBefore((90 - i) * 1440),
  requests: Math.floor(
    38000 + 30000 * Math.abs(Math.sin(i / 9)) + rand() * 12000
  ),
  cached: Math.floor(
    21000 + 18000 * Math.abs(Math.sin(i / 9 + 1)) + rand() * 8000
  ),
  // Sparse like real telemetry: not every day has every measurement.
  errors: i % 4 !== 3 ? Math.floor(rand() * 420) : undefined,
  p75Ms: i % 3 === 0 ? Math.floor(120 + rand() * 160) : undefined,
}))

// Image descriptors like next/image emits: intrinsic size plus an inline
// base64 blur placeholder. The placeholder strings are the kind of long
// strings Flight outlines into text rows.
function blurPlaceholder(seed, w, h) {
  const bytes = []
  for (let i = 0; i < 900 + (seed % 500); i++) {
    bytes.push((seed * 31 + i * 7) % 64)
  }
  const b64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  return 'data:image/webp;base64,UklGR' + bytes.map((b) => b64[b]).join('')
}
export function imageMeta(seed, w, h) {
  const base =
    '/_next/image?url=%2Fscreenshots%2Fdeploy-' + seed.toString(36) + '.webp'
  return {
    src: base + '&w=' + w * 2 + '&q=75',
    srcSet: [1, 2]
      .map((x) => base + '&w=' + w * x + '&q=75 ' + x + 'x')
      .join(', '),
    width: w,
    height: h,
    blurWidth: 8,
    blurHeight: Math.round((8 * h) / w),
    blurDataURL: blurPlaceholder(seed, w, h),
  }
}

const FRAMEWORKS = [
  'Next.js',
  'Next.js',
  'Next.js',
  'SvelteKit',
  'Nuxt',
  'Astro',
  'Remix',
]
export const projects = Array.from({ length: 10 }, (_, i) => ({
  id: 'prj_' + i,
  updatedAt: minutesBefore(Math.floor(rand() * 4000) + 1),
  name:
    PROJECTS[i % PROJECTS.length] +
    (i >= PROJECTS.length ? '-' + Math.floor(i / PROJECTS.length) : ''),
  domain:
    PROJECTS[i % PROJECTS.length] +
    (i >= PROJECTS.length ? '-' + Math.floor(i / PROJECTS.length) : '') +
    '.acme.dev',
  lastCommit: pick(COMMITS),
  status: pick(STATUSES),
  framework: pick(FRAMEWORKS),
}))

const ACTIVITY_VERBS = [
  ['deployed', 'to production'],
  ['promoted', 'to production'],
  ['rolled back', 'to a previous deployment'],
  ['created a preview for', ''],
  ['updated environment variables in', ''],
  ['transferred', 'to team acme'],
  ['enabled analytics for', ''],
]
export const activity = Array.from({ length: 14 }, (_, i) => {
  const [verb, suffix] = pick(ACTIVITY_VERBS)
  return {
    id: 'evt_' + i,
    actor: people[Math.floor(rand() * people.length)],
    verb,
    target: pick(PROJECTS),
    suffix,
    at: minutesBefore(Math.floor(rand() * 4300) + 1),
  }
})

const TOPICS = [
  [
    'Understanding streaming server rendering',
    'streaming',
    'Why time-to-first-byte and progressive rendering matter more than raw benchmark scores, and how a streaming architecture changes both.',
  ],
  [
    'Partial prerendering in practice',
    'ppr',
    'Static shells with dynamic holes sound simple. Shipping them across a large app surface uncovered edge cases worth writing down.',
  ],
  [
    'Designing a cache-first data layer',
    'caching',
    'A tour of tag-based invalidation, soft revalidation windows, and what happens when a CDN and a framework disagree about freshness.',
  ],
  [
    'Edge functions at scale',
    'edge',
    'What we learned running billions of edge invocations: cold starts, regional failover, and the operational playbook we wish we had.',
  ],
  [
    'Migrating a monolith to the App Router',
    'migration',
    'A 400-route migration completed route-group by route-group, with zero downtime and a rollback story we thankfully never used.',
  ],
  [
    'Image optimization beyond formats',
    'images',
    'AVIF and WebP are table stakes. Placeholder strategies, priority hints, and layout stability move the real metrics.',
  ],
  [
    'Typed APIs without codegen fatigue',
    'typescript',
    'Balancing end-to-end type safety against build times, and where schema inference earns its keep.',
  ],
  [
    'Observability for server components',
    'observability',
    'Tracing a request across the router, the render tree, and the data layer without drowning in spans.',
  ],
]
const ROLES = [
  'Software Engineer',
  'Staff Engineer',
  'Developer Advocate',
  'Product Engineer',
  'Infrastructure Engineer',
]

// Categories are shared entities referenced by every post, like a
// normalized CMS relation.
export const categories = {
  engineering: {
    name: 'Engineering',
    slug: 'engineering',
    description: 'Deep dives from the teams building the platform.',
    isDraft: false,
  },
  guides: {
    name: 'Guides',
    slug: 'guides',
    description: 'Step-by-step guides and how-tos.',
    isDraft: false,
  },
  company: {
    name: 'Company News',
    slug: 'company-news',
    description: 'Catch up on the latest news and events.',
    isDraft: false,
  },
}

const SENTENCES = [
  'The first thing to understand is how the request path is actually shaped in production.',
  'We measured this against real traffic before and after the rollout.',
  'The naive approach works until concurrency rises, and then the tail latencies tell a different story.',
  'Caching at the right layer turned out to matter more than caching aggressively.',
  'Every migration of this size accumulates small decisions worth documenting.',
  'The failure mode we cared about most was the one users would notice first.',
  'Instrumentation came before optimization, which saved us from at least two wrong turns.',
  'What follows is the playbook we wish we had at the start.',
]

// A Contentful-style rich text document, the shape CMS list APIs return
// for every post in an index response.
function richText(seedIdx, paragraphs) {
  const content = []
  for (let p = 0; p < paragraphs; p++) {
    if (p % 4 === 3) {
      content.push({
        nodeType: 'heading-2',
        data: {},
        content: [
          {
            nodeType: 'text',
            value: [
              'Background',
              'The approach',
              'Results',
              'Tradeoffs',
              'Operations',
            ][p % 5],
            marks: [],
            data: {},
          },
        ],
      })
      continue
    }
    const runs = []
    const subjects = [
      'the router',
      'the cache layer',
      'our deploy pipeline',
      'the edge runtime',
      'the data layer',
      'the build step',
      'observability',
      'the client bundle',
    ]
    const qualifiers = [
      'under load',
      'at the p99',
      'across regions',
      'in production',
      'during rollout',
      'for large teams',
      'on cold starts',
      'at steady state',
    ]
    // Rich text editors split runs at every mark boundary, so real CMS
    // documents carry many short text runs inside deep node structures
    // rather than long strings.
    for (let r = 0; r < 4 + ((seedIdx + p) % 4); r++) {
      const base = SENTENCES[(seedIdx + p * 3 + r) % SENTENCES.length]
      const words = (
        base +
        ' For ' +
        subjects[(seedIdx * 5 + p * 2 + r) % subjects.length] +
        ' ' +
        qualifiers[(seedIdx * 3 + p + r * 2) % qualifiers.length] +
        ', this shaped decision ' +
        ((seedIdx * 7 + p * 3 + r) % 90) +
        ' of the rollout.'
      ).split(' ')
      let w = 0
      let piece = 0
      while (w < words.length) {
        const take = 5 + ((seedIdx + p + r + piece) % 6)
        const m = (seedIdx + p * 2 + r * 3 + piece) % 9
        runs.push({
          nodeType: 'text',
          value: words.slice(w, w + take).join(' ') + ' ',
          marks:
            m === 4
              ? [{ type: 'italic' }]
              : m === 7
                ? [{ type: 'bold' }]
                : m === 8
                  ? [{ type: 'code' }]
                  : [],
          data: {},
        })
        w += take
        piece++
      }
    }
    content.push({ nodeType: 'paragraph', data: {}, content: runs })
  }
  return { nodeType: 'document', data: {}, content }
}

export const posts = Array.from({ length: 74 }, (_, i) => {
  const [title, tag, excerpt] = TOPICS[i % TOPICS.length]
  const first = pick(FIRST)
  const last = pick(LAST)
  const day = 1 + Math.floor(rand() * 27)
  const month = 1 + Math.floor(rand() * 12)
  return {
    id: 'post_' + i,
    slug: tag + '-' + i,
    title:
      i < TOPICS.length
        ? title
        : title + ', part ' + (Math.floor(i / TOPICS.length) + 1),
    excerpt:
      i < TOPICS.length
        ? excerpt
        : excerpt.split('.')[0] +
          ', continued: part ' +
          (Math.floor(i / TOPICS.length) + 1) +
          ' covers ' +
          [
            'rollout mechanics',
            'operational lessons',
            'failure modes we hit',
            'the measurement story',
            'API design details',
          ][i % 5] +
          ' in depth.',
    author: {
      name: first + ' ' + last,
      role: pick(ROLES),
      avatarHue: Math.floor(rand() * 360),
    },
    subtitle: i % 3 === 0 ? 'Notes from shipping this at scale.' : undefined,
    updatedAt: i % 4 === 0 ? '2026-0' + (1 + (i % 6)) + '-15' : undefined,
    canonicalOverride: undefined,
    category:
      i % 3 === 0
        ? categories.engineering
        : i % 3 === 1
          ? categories.guides
          : categories.company,
    content: richText(i, 4 + (i % 3)),
    tags: [
      tag,
      i % 3 === 0 ? 'engineering' : 'guides',
      i % 5 === 0 ? 'deep-dive' : 'how-to',
    ],
    publishedAt:
      '2026-' +
      String(month).padStart(2, '0') +
      '-' +
      String(day).padStart(2, '0'),
    readingMinutes: 4 + Math.floor(rand() * 14),
    cover: {
      hueA: Math.floor(rand() * 360),
      hueB: Math.floor(rand() * 360),
      alt: 'Abstract gradient cover for ' + title,
    },
    outline: [
      'Background',
      'The approach',
      'Tradeoffs we accepted',
      'Results',
      'What we would do differently',
    ].slice(0, 3 + (i % 3)),
    seo: {
      description: excerpt.split('.')[0] + '.',
      ogImage: '/og/' + tag + '-' + i + '.png',
      canonical: 'https://acme.dev/blog/' + tag + '-' + i,
    },
    stats: {
      views: Math.floor(rand() * 90000) + 1200,
      likes: Math.floor(rand() * 900),
      comments: Math.floor(rand() * 120),
    },
  }
})

const DOC_SECTIONS = [
  'testing',
  'authentication',
  'data-fetching',
  'getting-started',
  'guides',
  'app',
  'pages',
  'api-reference',
  'architecture',
  'community',
  'deployment',
  'configuration',
  'errors',
  'recipes',
  'upgrading',
  'cli',
  'functions',
]
const DOC_WORDS = [
  'routing',
  'rendering',
  'caching',
  'fetching',
  'streaming',
  'middleware',
  'images',
  'fonts',
  'scripts',
  'metadata',
  'errors',
  'redirects',
  'headers',
  'cookies',
  'forms',
  'auth',
  'deploy',
  'testing',
  'upgrading',
  'debugging',
]
function docNode(version, section, idx, depth) {
  const word = DOC_WORDS[(idx * 7 + depth * 3) % DOC_WORDS.length]
  const title =
    word[0].toUpperCase() +
    word.slice(1) +
    (depth > 0
      ? ' ' + ['basics', 'patterns', 'reference', 'examples'][idx % 4]
      : '')
  const path =
    '/docs/' +
    version +
    '/' +
    section +
    '/' +
    word +
    (depth > 0 ? '-' + idx : '')
  const node = {
    title,
    path,
    // Optional fields are genuinely absent on many nodes, like real content
    // pipelines where frontmatter is incomplete; absent -> undefined -> a
    // "$undefined" on the wire.
    description:
      idx % 2 === 0
        ? 'How ' +
          word +
          ' works in version ' +
          version +
          ', when to reach for it, and the tradeoffs involved.'
        : undefined,
    source:
      idx % 3 === 0
        ? section + '/' + String(idx).padStart(2, '0') + '-' + word + '.mdx'
        : undefined,
    lastModified:
      idx % 5 < 2
        ? '2026-' +
          String(1 + (idx % 12)).padStart(2, '0') +
          '-' +
          String(1 + (idx % 27)).padStart(2, '0')
        : undefined,
    version,
    children:
      depth < 2 && idx % 2 === 0
        ? Array.from({ length: 3 + (idx % 3) }, (_, j) =>
            docNode(version, section, idx * 4 + j + 1, depth + 1)
          )
        : [],
  }
  return node
}
export const docsTree = Object.fromEntries(
  ['stable', 'v15', 'v14'].map((version) => [
    version,
    DOC_SECTIONS.map((section, s) =>
      Array.from({ length: 6 }, (_, i) =>
        docNode(version, section, s * 5 + i, 0)
      )
    ).flat(),
  ])
)

export const domains = Array.from({ length: 12 }, (_, i) => ({
  id: 'dom_' + i,
  name:
    (i % 3 === 0 ? 'www.' : '') +
    PROJECTS[i % PROJECTS.length] +
    (i % 4 === 0 ? '.com' : '.dev'),
  project: PROJECTS[i % PROJECTS.length],
  verified: i % 5 !== 4,
  ssl: i % 7 !== 6 ? 'active' : 'pending',
  registrar: i % 2 === 0 ? 'third-party' : 'acme-domains',
  expiresAt:
    i % 3 !== 2 ? minutesBefore(-(60 * 24 * (200 + i * 9))) : undefined,
  nameservers:
    i % 2 === 0 ? ['ns1.acme-dns.com', 'ns2.acme-dns.com'] : undefined,
}))

export const alerts = [
  {
    id: 'alert_usage',
    severity: 'warning',
    title: 'Bandwidth at 71% of included allowance',
    body: 'At the current pace this billing period ends at roughly 96%. Consider enabling spend controls or upgrading the plan.',
    action: 'Review usage',
    dismissible: true,
  },
  {
    id: 'alert_cert',
    severity: 'info',
    title: 'Certificate rotation scheduled',
    body: 'Certificates for 3 domains renew automatically within the next 72 hours. No action is needed.',
    action: undefined,
    dismissible: true,
  },
]

export const members = Array.from({ length: 10 }, (_, i) => ({
  person: people[i % people.length],
  role: ['owner', 'member', 'member', 'developer', 'billing', 'viewer'][i % 6],
  mfa: i % 4 !== 3,
  joinedAt: minutesBefore(Math.floor(rand() * 500000) + 1440),
  lastActiveAt:
    i % 5 !== 4 ? minutesBefore(Math.floor(rand() * 10000) + 5) : undefined,
}))

export const screenshots = projects.slice(0, 4).map((p, i) => ({
  project: p.name,
  image: imageMeta(i * 97 + 13, 1200, 630),
}))

const LOG_TEXTS_LONG = [
  'GET /api/deployments?teamId=team_kq83majnf02m&limit=20&state=READY 200 in 84ms (region: iad1, cache: MISS, requestId: pdx1::vjk2m-1751371200412-8f3ab2c19d04)',
  'Cache key generated: fetch:https://api.acme.dev/v2/projects/prj_8f3ab2c19d04/deployments?state=ready&sort=created:desc [tags: deployments,projects]',
  'Revalidated 4 paths for tag "deployments": /acme/overview, /acme/deployments, /acme/analytics, /api/og/deployments (took 218ms)',
]
const LOG_TEXTS = [
  'GET /api/projects 200 in 24ms',
  'Cache HIT for /_next/data/build-id/index.json',
  'Revalidating tag: products',
  'Function execution took 182ms (limit: 10s)',
  'GET /dashboard 200 in 41ms',
  'Edge middleware matched /acme/overview',
  'ISR write completed for /blog',
  'Queue consumer acked 24 messages',
  'Cold start: 312ms in iad1',
  'GET /api/usage 200 in 12ms',
  'Cron /api/cron/cleanup completed',
  'Warning: slow query in listDeployments (1.2s)',
]
export const logLines = LOG_TEXTS.concat(LOG_TEXTS_LONG).map((text, i) => ({
  ts: '12:0' + (i % 10) + ':' + String(10 + ((i * 7) % 50)),
  level: text.startsWith('Warning') ? 'warn' : 'info',
  text,
}))
