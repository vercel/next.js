import { Suspense } from 'react'
// import { redirect } from './navigation' - removed

// Instead of importing dynamically, create an async component
async function MdxContent({ filePath }) {
  // This works in a server component
  const { default: Content } = await import(`${filePath}`)
  return <Content />
}

export default function Home() {
  // This will now throw an error instead of causing an infinite loop
  // redirect("");

  return (
    <div>
      <Suspense fallback={<div>Loading MDX...</div>}>
        <MdxContent filePath="./stuff.mdx" />
      </Suspense>
    </div>
  )
}
