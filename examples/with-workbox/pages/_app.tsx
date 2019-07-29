import NextApp from 'next/app'
import {
  SnackbarProvider,
  Snackbar,
  SnackbarMessageContext,
} from '../components/SnackBar'
import ServiceWorkerRegistrar from '../components/ServiceWorkerRegistrar'

interface State {
  swUpdateWaiting: boolean
}

export default class App extends NextApp<{}, State> {
  render() {
    return (
      <SnackbarProvider>
        {super.render()}
        <Snackbar open={false} />
        {process.env.NODE_ENV === 'production' && (
          <SnackbarMessageContext.Consumer>
            {({ showSnackMessage }) => (
              <ServiceWorkerRegistrar showSnackMessage={showSnackMessage} />
            )}
          </SnackbarMessageContext.Consumer>
        )}
      </SnackbarProvider>
    )
  }
}
