export default function HomePage() {
  return (
    <div>
      <h1 id="home-title">Home Page</h1>
      <iframe
        id="test-iframe"
        src="/iframe-content.html"
        style={{ width: '400px', height: '200px', border: '1px solid black' }}
      />
    </div>
  )
}
