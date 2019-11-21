import PropTypes from 'prop-types'
import Link from 'next/link'
import { compose, setDisplayName, pure, setPropTypes } from 'recompose'
import Clock from './clock'
import AddCount from './addCount'

const Page = ({ title, linkTo, light, lastUpdate, count, addCount }) => (
  <div>
    <h1>{title}</h1>
    <Clock lastUpdate={lastUpdate} light={light} />
    <AddCount count={count} addCount={addCount} />
    <nav>
      <Link href={linkTo}>
        <a>Navigate</a>
      </Link>
    </nav>
  </div>
)

export default compose(
  setDisplayName('Page'),
  setPropTypes({
    title: PropTypes.string,
    linkTo: PropTypes.string,
    light: PropTypes.bool,
    lastUpdate: PropTypes.number,
    count: PropTypes.number,
    addCount: PropTypes.func,
  }),
  pure
)(Page)
