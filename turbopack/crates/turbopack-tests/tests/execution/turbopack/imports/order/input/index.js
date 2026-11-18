import posts from './posts'

it('resolves an extensionless request to a TypeScript file before a JSON file', () => {
  // `./posts` could resolve to `posts.ts` or `posts.json`, `.ts` must win.
  expect(posts).toEqual({ js: true })
})
