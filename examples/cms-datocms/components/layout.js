import Alert from '../components/alert'
import Footer from '../components/footer'

export default function Layout({ children }) {
  return (
    <>
      <div className="min-h-screen">
        <Alert />
        {children}
      </div>
      <Footer />
    </>
  )
}
