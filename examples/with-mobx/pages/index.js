/* global setTimeout */

// modules
import { Component } from 'react'

// components
import Page from '../components/Page'

// store
import { initStore, withMobX } from '../store'

export default withMobX('store', initStore, 'anotherStore', initStore)(
    class Index extends Component {
      static async getInitialProps (ctx) {
            // MobX stores are available within wrapped getInitialProps at
            // `ctx.store` and `ctx.anotherStore`

        return new Promise((resolve) => {
          setTimeout(() => resolve(
            { myInitProp: 'TRUE',
              InitLastUpdate_1: ctx.store.lastUpdate,
              InitLastUpdate_2: ctx.anotherStore.lastUpdate
            }
                ))
        })
      }

        // MobX stores are available within wrapped component at
        // `this.props.store` and `this.props.anotherStore`

      componentDidMount () {
        this.props.anotherStore.start()
      }

      componentWillUnmount () {
        this.props.anotherStore.stop()
      }

      render () {
        return (
          <div>
            <Page title='Index Page' linkTo='/other' />
            <p>Raw clocks: &nbsp;
                    {this.props.store.lastUpdate}&ensp;
              {this.props.anotherStore.lastUpdate}
            </p>
            <p>withMobX calls page's getInitialProps static method: &nbsp;
                    {this.props.myInitProp}</p>
            <p>withMobX forwards initialized stores as props<br />on the
                    context argument of page's getInitialProps: &nbsp;
                    {this.props.InitLastUpdate_1}&ensp;
              {this.props.InitLastUpdate_2}</p>
          </div>
        )
      }
    }
)
