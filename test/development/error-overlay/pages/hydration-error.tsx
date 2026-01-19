export default function Home() {
  return (
    <div>{typeof window === 'undefined' ? <p>Server</p> : <p>Client</p>}</div>
  )
}
