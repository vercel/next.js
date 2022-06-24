import Alert from './alert'
import Footer from './footer'
import Meta from './meta'
import 'lazysizes'
import 'lazysizes/plugins/parent-fit/ls.parent-fit'

type LayoutProps = {
  preview,
  children,
};

const Layout = (props: LayoutProps) => {
const { preview, children } = props;
  
  return (
        <>
          <Meta />
          <div className="min-h-screen">
            <Alert preview={preview}/>
            <main>{children}</main>
          </div>
          <Footer />
        </>
      )
  }
  
export default Layout;
