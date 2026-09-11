export const revalidate = 3600

async function getStories() {
  await new Promise((resolve) => setTimeout(resolve, 80))
  return ['City council approves new park', 'Night market opens Friday']
}

export default async function NewsPage() {
  const stories = await getStories()

  return (
    <main>
      <h1>Newsroom</h1>
      {stories.map((story) => (
        <article key={story}>{story}</article>
      ))}
    </main>
  )
}
