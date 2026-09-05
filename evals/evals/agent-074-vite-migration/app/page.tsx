import DebugBadge from '../components/DebugBadge'
import RecipeBrowser from '../components/RecipeBrowser'
import Footer from '../components/Footer'

export default function Page() {
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
