export default function Page() {
  return (
    <main>
      <p>home</p>
      {/*
        A typical mobile layout control (e.g. a floating action button) in the
        bottom-left corner, which is also the default position of the dev tools
        indicator.
      */}
      <a
        id="menu-button"
        href="/menu"
        style={{
          position: 'fixed',
          left: 16,
          bottom: 16,
          width: 48,
          height: 48,
          background: 'cyan',
          zIndex: 10,
        }}
      >
        menu
      </a>
    </main>
  )
}
