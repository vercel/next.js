type Metadata = { title: string }

export default function Page() {
  return <p>hello world</p>
}

export { metadata }

const metadata: Metadata = {
  title: 'Metadata',
}
