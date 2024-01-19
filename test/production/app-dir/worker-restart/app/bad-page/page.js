export async function generateMetadata() {
  await new Promise((resolve) => setTimeout(resolve, 11000))

  return {
    title: 'Test',
  }
}

export default function Page() {
  return <div>Hello World</div>
}
