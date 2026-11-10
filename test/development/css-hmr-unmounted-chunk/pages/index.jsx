import dynamic from 'next/dynamic'

const App = dynamic(() => import('../App'), {
  ssr: false,
  loading: () => <p>app loading…</p>,
})

export default function Home() {
  return <App />
}
