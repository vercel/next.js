export default function Page() {
  const data = {
    url: import.meta.url,
  }

  return <div id="test-data">{JSON.stringify(data)}</div>
}
