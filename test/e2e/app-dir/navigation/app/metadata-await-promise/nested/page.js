import React from 'react'

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
