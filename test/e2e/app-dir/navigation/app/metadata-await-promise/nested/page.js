import React from 'react'

export default function page() {
  return <div>Content</div>
}

async function getTitle() {
  return await new Promise((resolve) =>
    setTimeout(() => resolve('title'), 1000)
  )
}

export async function generateMetadata() {
  return { title: await getTitle() }
}
