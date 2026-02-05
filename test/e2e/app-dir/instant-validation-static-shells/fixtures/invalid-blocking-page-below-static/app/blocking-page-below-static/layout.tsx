export const unstable_instant = { prefetch: 'static' }

export default async function Layout({ children }) {
  return (
    <div>
      <p>
        This is a layout with{' '}
        <code>{`unstable_instant = { prefetch: 'static' }`}</code>.
      </p>
      <hr />
      {children}
    </div>
  )
}
