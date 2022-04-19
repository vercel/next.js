export default function AppServer({ children }) {
  return (
    <div className="app-server-root" data-title={children.type.title || ''}>
      <style>{`.app-server-root { border: 2px solid blue; }`}</style>
      {children}
    </div>
  )
}
