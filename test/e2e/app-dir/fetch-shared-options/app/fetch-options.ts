// Reused by every fetch in page.tsx, like options exported from an API client
// module.
export const fetchOptions: RequestInit = {
  next: { revalidate: 3600, tags: ['shared'] },
}
