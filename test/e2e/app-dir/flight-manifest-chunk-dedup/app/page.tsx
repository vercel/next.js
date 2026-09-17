import { Header } from './header'
import { Footer } from './footer'
import { Sidebar } from './sidebar'
import { Counter } from './counter'

export default function Page() {
  return (
    <main>
      <h1>Flight Chunk Dedup Test</h1>
      <Header />
      <Sidebar />
      <Counter />
      <Footer />
    </main>
  )
}
