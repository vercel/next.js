import Navigation from './Navigation'

export default function PageLayout({ children, title }) {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <Navigation />
      <h1>{title}</h1>
      {children}
    </div>
  )
}
