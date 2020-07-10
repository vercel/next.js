import { CartProvider } from '@/lib/cart'
import Meta from './meta'
import Alert from './alert'
import Container from './container'
import Header from './header'
import Footer from './footer'
import CartModal from './cart-modal'
import 'lazysizes'
import 'lazysizes/plugins/parent-fit/ls.parent-fit'

export default function Layout({ preview, shop, pages, children }) {
  return (
    <>
      <Meta />
      <div className="min-h-screen">
        <Alert preview={preview} />
        <Container>
          <CartProvider>
            <Header title={shop.name} pages={pages} />
            <main>{children}</main>
            <CartModal />
          </CartProvider>
        </Container>
      </div>
      <Footer shop={shop} pages={pages} />
    </>
  )
}
