import Header from './header'

export default function Layout({ children, modal }) {
  return (
    <div>
      <Header />
      {children}
      {modal}
    </div>
  )
}
