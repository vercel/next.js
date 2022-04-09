export default function AppServer({ children }) {
  return (
    <div className="app-server-root">
      <style>{`.app-server-root { border: 2px solid blue; }`}</style>
      {children}
    </div>
  )
}
