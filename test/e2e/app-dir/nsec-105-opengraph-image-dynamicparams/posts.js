const posts = {
  'public-post': {
    status: 'public',
    title: 'Public quarterly update',
    internalSummary: 'Public summary only',
  },
  'acquisition-draft': {
    status: 'draft',
    title: 'Draft acquisition plan',
    internalSummary: 'Target: private roadmap and valuation notes',
  },
}

export function getPost(slug) {
  return posts[slug]
}

export function publicPostParams() {
  return [{ slug: 'public-post' }]
}
