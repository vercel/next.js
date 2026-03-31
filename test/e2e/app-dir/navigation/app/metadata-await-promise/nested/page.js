import { setTimeout } from 'node:timers/promises'
import React from 'react'

export default async function Page() {
  // Ensure we trigger the loading state.
  // `connection` isn't sufficient since a parent might've already suspended
  // on connection.
  await setTimeout(50)
  return <div id="page-content">Content</div>
}

async function getTitle() {
  return setTimeout(5000, 'Async Title')
}

export async function generateMetadata() {
  return { title: await getTitle() }
}
