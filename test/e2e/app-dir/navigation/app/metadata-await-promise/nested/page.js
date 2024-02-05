import React from 'react'

// ensure this page is dynamically rendered so we always trigger a loading state
export const dynamic = 'force-dynamic'

export default function page() {
  return <div id="page-content">Content</div>
}

async function getTitle() {
  return await new Promise((resolve) =>
    setTimeout(() => resolve('Async Title'), 1000)
  )
}

export async function generateMetadata() {
  return { title: await getTitle() }
}
