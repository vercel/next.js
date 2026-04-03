export default function PageB() {
  return (
    <div>
      <h1 id="page-b-title">Page B Content</h1>
      {/* Tall content so the browser doesn't auto-scroll when page height changes */}
      <div
        style={{
          height: '3000px',
          background: 'linear-gradient(#c0d0e0, #8090a0)',
        }}
      >
        <p>Tall content on page B</p>
      </div>
    </div>
  )
}
