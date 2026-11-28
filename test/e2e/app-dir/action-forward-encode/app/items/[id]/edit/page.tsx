import Editor from './editor'

export function generateStaticParams() {
  return [{ id: '1' }]
}

export default function Page() {
  return <Editor />
}
