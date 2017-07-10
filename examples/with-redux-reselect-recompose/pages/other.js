import { startClock, addCount, serverRenderClock } from 'actions'
import Page from 'containers/page'
import withRedux from 'next-redux-wrapper'
import { compose, setDisplayName, pure, lifecycle, withProps } from 'recompose'
import initStore from '../store'

const Counter = compose(
  setDisplayName('OtherPage'),
  withProps({
    title: 'Other page',
    linkTo: '/'
  }),
  lifecycle({
    componentDidMount () {
      this.timer = this.props.startClock()
    },
    componentWillUnmount () {
      clearInterval(this.timer)
    }
  }),
  pure
)(Page)

Counter.getInitialProps = ({ store, isServer }) => {
  store.dispatch(serverRenderClock(isServer))
  store.dispatch(addCount())
  return { isServer }
}

export default withRedux(initStore, null, { startClock })(Counter)
