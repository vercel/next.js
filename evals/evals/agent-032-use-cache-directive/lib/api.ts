export async function getPosts() {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 100))

  return [
    { id: 1, title: 'Getting Started with Next.js', author: 'Jane Doe' },
    {
      id: 2,
      title: 'Understanding React Server Components',
      author: 'John Smith',
    },
    { id: 3, title: 'Modern Caching Strategies', author: 'Alice Johnson' },
    { id: 4, title: 'Building Scalable Applications', author: 'Bob Wilson' },
    {
      id: 5,
      title: 'Best Practices for Web Development',
      author: 'Carol Brown',
    },
  ]
}
