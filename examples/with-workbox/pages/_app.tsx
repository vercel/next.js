import NextApp from 'next/app'
import MaterialSnackbar, { SnackbarProps } from '../components/SnackBar'
import registerServiceWorker from '../utils/serviceWorkerRegistrar'

interface State {
  snackbarProps: SnackbarProps
}

export default class App extends NextApp<{}, State> {
  state: Readonly<State> = {
    snackbarProps: {
      open: false,
    },
  }
  async componentDidMount() {
    // Keep all non essential to your app below await Promise.resolve
    await Promise.resolve()

    // Service Worker is an enhancement.
    // If it errors, your App should still function.
    if (process.env.NODE_ENV === 'production') {
      registerServiceWorker(this.showSnack)
    }
  }

  showSnack = (snackbarProps: SnackbarProps) => {
    this.setState({ snackbarProps })
  }

  render() {
    const { snackbarProps } = this.state
    return (
      <>
        {super.render()}
        <MaterialSnackbar {...snackbarProps} />
      </>
    )
  }
}
