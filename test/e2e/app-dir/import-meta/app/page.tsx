export default function Page() {
  const dirname = import.meta.dirname
  const filename = import.meta.filename
  return (
    <div>
      <p id="dirname">{dirname}</p>
      <p id="filename">{filename}</p>
    </div>
  )
}
