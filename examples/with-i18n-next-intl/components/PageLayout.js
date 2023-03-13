import Navigation from './Navigation'

export default function PageLayout({ children, title }) {
  return (
    <div
      style={{
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
        lineHeight: 1.5,
      }}
    >
      <Navigation />
      <div style={{ maxWidth: 510 }}>
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  )
}
