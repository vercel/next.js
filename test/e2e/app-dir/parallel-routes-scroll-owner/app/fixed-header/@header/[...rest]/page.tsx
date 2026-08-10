export default function HeaderRest() {
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
      {/* Nested static child: elementFromPoint hits this, not the fixed header. */}
      <span>Fixed header</span>
    </header>
  )
}
