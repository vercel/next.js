import { Suspense } from 'react'

// Simulate async component
async function SlowComponent({ id, delay }: { id: string; delay: number }) {
  await new Promise((resolve) => setTimeout(resolve, delay))
  return <div data-testid={`content-${id}`}>Content {id} loaded</div>
}

// Header with its own Suspense boundary
function Header() {
  return (
    <header>
      <Suspense fallback={<div data-testid="header-loading">Loading header...</div>}>
        <SlowComponent id="header" delay={100} />
      </Suspense>
    </header>
  )
}

// Sidebar with nested Suspense boundaries
function Sidebar() {
  return (
    <aside>
      <Suspense fallback={<div data-testid="sidebar-loading">Loading sidebar...</div>}>
        <div data-testid="sidebar-container">
          <SlowComponent id="sidebar-top" delay={50} />
          <Suspense fallback={<div data-testid="sidebar-nested-loading">Loading nested...</div>}>
            <SlowComponent id="sidebar-nested" delay={150} />
          </Suspense>
        </div>
      </Suspense>
    </aside>
  )
}

// Main content area
function MainContent() {
  return (
    <main>
      <Suspense fallback={<div data-testid="main-loading">Loading main...</div>}>
        <SlowComponent id="main" delay={200} />
      </Suspense>
    </main>
  )
}

// Footer
function Footer() {
  return (
    <footer>
      <Suspense fallback={<div data-testid="footer-loading">Loading footer...</div>}>
        <SlowComponent id="footer" delay={75} />
      </Suspense>
    </footer>
  )
}

export default function Page() {
  return (
    <div data-testid="page-root">
      <h1>Suspense Profiling Test</h1>

      {/* Multiple Suspense boundaries at different levels */}
      <Suspense fallback={<div data-testid="outer-loading">Loading page...</div>}>
        <Header />
        <div style={{ display: 'flex' }}>
          <Sidebar />
          <MainContent />
        </div>
        <Footer />
      </Suspense>
    </div>
  )
}
