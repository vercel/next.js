export default function AuthLayout(props: LayoutProps<'/'>) {
  return (
    <div>
      <div style={{ padding: '20px', backgroundColor: '#f5f5f5' }}>
        <h2>Authentication</h2>
        <nav>
          <a href="/login" style={{ marginRight: '10px' }}>
            Login
          </a>
          <a href="/register">Register</a>
        </nav>
      </div>
      <main style={{ padding: '20px' }}>{props.children}</main>
    </div>
  )
}
