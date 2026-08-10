export const instant = true

export default async function Layout({ children }) {
  return (
    <div>
      <p>
        This is a layout with <code>{`instant = { prefetch: 'static' }`}</code>.
      </p>
      <hr />
      {children}
    </div>
  )
}
