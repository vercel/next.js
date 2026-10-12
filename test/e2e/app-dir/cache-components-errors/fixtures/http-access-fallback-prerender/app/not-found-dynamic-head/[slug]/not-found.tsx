export async function generateMetadata() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  return {
    title: 'not-found metadata marker',
    description: 'metadata from not-found.tsx',
  }
}

export async function generateViewport() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  return { themeColor: '#123456' }
}

export default function NotFound() {
  return <p>not found with dynamic head</p>
}
