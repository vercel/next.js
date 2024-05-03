process.on('unhandledRejection', (rej) => {
  console.log('unhandledRejection', rej)
  process.exit(1)
})

export const revalidate = 0

export default function Layout({ children }) {
  return (
    <>
      <p>Layout</p>
      {children}
    </>
  )
}

export async function generateMetadata() {
  await new Promise((resolve) => {
    setTimeout(() => {
      process.nextTick(resolve)
    }, 2_000)
  })
  return {}
}
