import React from 'react'
import Router from 'next/router'
import { Workbox, messageSW } from 'workbox-window'
import { WorkboxEvent } from 'workbox-window/utils/WorkboxEvent'
import Button from '@material-ui/core/Button'

import { generateSnackMessage, SnackbarWrapperState } from './SnackBar'

interface Props {
  showSnackMessage: SnackbarWrapperState['showSnackMessage']
}

interface State {
  swUpdateWaiting: boolean
}

export default class ServiceWorkerRegistrar extends React.Component<
  Props,
  State
> {
  state: Readonly<State> = {
    swUpdateWaiting: false,
  }

  wb: Workbox | undefined
  registration: ServiceWorkerRegistration | undefined

  async componentDidMount() {
    if (!navigator.serviceWorker) return

    const wb = new Workbox('/sw.js')
    this.wb = wb
    this.registration = await wb.register()
    wb.addEventListener('activated', (ev: WorkboxEvent) => {
      // @ts-ignore
      if (ev.isUpdate) {
        // New Service Worker has been activated.
        // You will need to refresh the page.
        return window.location.reload()
      }
      const { showSnackMessage } = this.props
      showSnackMessage(
        generateSnackMessage(
          { message: 'Service Worker Installed' },
          showSnackMessage
        )
      )
    })
    wb.addEventListener('waiting', this.onSWWaiting)

    Router.events.on('routeChangeStart', e => {
      if (this.state.swUpdateWaiting && this.wb) {
        window.location.reload()
      }
    })
  }

  private onSWWaiting = () => {
    this.setState({
      swUpdateWaiting: true,
    })
    // There is a new version of Service Worker.
    // And now there are two of them.
    // Show the user that he has to reload
    const { showSnackMessage } = this.props
    showSnackMessage(
      generateSnackMessage(
        {
          message: 'A new version is now available',
          action: (
            <Button
              key="undo"
              color="secondary"
              size="small"
              onClick={this.onReloadClick}
            >
              RELOAD
            </Button>
          ),
        },
        showSnackMessage
      )
    )
  }

  private onReloadClick = async () => {
    if (!this.registration || !this.registration.active) return
    const { showSnackMessage } = this.props
    const clientCount = await messageSW(this.registration.active, {
      type: 'CLIENTS_COUNT',
    })
    if (clientCount > 1) {
      return showSnackMessage(
        generateSnackMessage(
          {
            message:
              'You have other tabs open. You might lose unsaved data on those tabs',
            action: (
              <Button
                key="undo"
                color="secondary"
                size="small"
                onClick={this.upgradeServiceWorker}
              >
                RELOAD THEM ALL?
              </Button>
            ),
          },
          showSnackMessage
        )
      )
    }
    this.upgradeServiceWorker()
  }

  private upgradeServiceWorker = () => {
    const { showSnackMessage } = this.props
    showSnackMessage({ open: false })
    if (this.registration && this.registration.waiting) {
      this.registration.waiting.postMessage({
        type: 'SKIP_WAITING',
      })
    }
  }

  render() {
    return null
  }
}
