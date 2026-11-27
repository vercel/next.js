import mtimeMs from './resource.selfstat'

export default function Page() {
  return (
    <>
      <p>hello world</p>
      <p id="mtime">{mtimeMs}</p>
    </>
  )
}
