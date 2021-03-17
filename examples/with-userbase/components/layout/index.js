import Nav from '../nav'
function Layout({ user, setUser, children }) {
  return (
    <div className="container mx-auto">
      <Nav user={user} setUser={setUser} />
      {children}
    </div>
  )
}

export default Layout
