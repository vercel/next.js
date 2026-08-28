export const posts: Record<string, { title: string; excerpt: string }> = {
  'hello-world': {
    title: 'Hello World',
    excerpt: 'Our very first post on the new blog.',
  },
  'ship-faster': {
    title: 'Ship Faster',
    excerpt: 'How we cut our release cycle in half.',
  },
}

export function getAllSlugs(): string[] {
  return Object.keys(posts)
}
