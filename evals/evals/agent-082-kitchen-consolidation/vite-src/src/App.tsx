import DebugBadge from './DebugBadge'
import RecipeBrowser from './RecipeBrowser'
import Footer from './Footer'

export default function App() {
  return (
    <main>
      <h1>Recipe Box</h1>
      <div id="page-badge">
        <DebugBadge />
      </div>
      <RecipeBrowser />
      <Footer />
    </main>
  )
}
