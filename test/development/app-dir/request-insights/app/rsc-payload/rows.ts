export const rows = Array.from({ length: 500 }, (_, index) => ({
  id: index,
  name: `user-${index}`,
  email: `user${index}@example.com`,
}))
