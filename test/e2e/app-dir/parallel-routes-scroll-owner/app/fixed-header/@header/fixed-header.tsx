export default function FixedHeader() {
  return (
    <header
      style={{
        position: 'fixed',
        top: 8,
        left: 8,
        right: 8,
        height: 48,
        zIndex: 20,
      }}
    >
      <span>Fixed header</span>
    </header>
  )
}
