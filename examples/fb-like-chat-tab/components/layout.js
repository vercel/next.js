import Header from '../components/header'
import ChatComponent from '../components/chatComponent'
const Layout = (props) => (
  <div className='layout'>
    <Header />
    <ChatComponent />
    <style jsx>{`
      .layout {
        margin: 20px,
        padding: 20px,
        border: '5px solid #fff'
      }
    `}</style>
  </div>
)
export default Layout
