import Hoc from '../components/Hoc'

const Home = ({ isMobile }) => <h1>{isMobile ? 'Mobil' : 'Desktop'}</h1>

export default Hoc(Home)
