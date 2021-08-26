import Header from './Header'

const Page = ({ children }) => (
  <div>
    <Header />
    {children}
  </div>
)

export default Page
