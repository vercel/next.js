import React from 'react'
import Router from 'next/router'
import { Workbox, messageSW } from 'workbox-window'
import Button from '@material-ui/core/Button'

import { generateSnackMessage, SnackbarWrapperState } from './SnackBar'
import {
  WorkboxEvent,
  WorkboxLifecycleEvent,
} from 'workbox-window/utils/WorkboxEvent'
import { formatWithValidation } from 'next-server/dist/lib/utils'

interface Props {
  showSnackMessage: SnackbarWrapperState['showSnackMessage']
}

interface State {
  swUpdateWaiting: boolean
}

const HOUR_IN_MS = 60 * 60 * 1000

function wrap(
  checkCb: (url: string) => Promise<boolean>,
  baseCb: typeof Router.push
): typeof Router.push {
  return async function(url, asPath) {
    const path = asPath || url
    const newRoute =
      typeof path === 'object' ? formatWithValidation(path) : path
    if (!(await checkCb(newRoute))) {
      // @ts-ignore
      return await baseCb.apply(this, arguments)
    }
    return false
  }
}

const originalPush = Router.push
const originalReplace = Router.replace

export default class ServiceWorkerRegistrar extends React.Component<
  Props,
  State
> {
  state: Readonly<State> = {
    swUpdateWaiting: false,
  }

  wb: Workbox | undefined
  registration: ServiceWorkerRegistration | undefined
  navigateUrl: string | undefined
  refreshing: boolean = false

  async componentDidMount() {
    if (!navigator.serviceWorker) return

    const wb = new Workbox('/sw.js')
    this.wb = wb
    this.registration = await wb.register()
    if (this.registration && this.registration.waiting) {
      this.onSWWaiting()
    }
    wb.addEventListener('activated', this.onSWActivated)
    wb.addEventListener('waiting', this.onSWWaiting)
    setTimeout(this.checkForUpdates, HOUR_IN_MS)
  }

  private onSWActivated = (ev: WorkboxLifecycleEvent) => {
    if (ev.isUpdate) {
      if (this.refreshing) return
      // New Service Worker has been activated.
      // You will need to refresh the page.
      this.refreshing = true
      if (this.navigateUrl) {
        return (window.location.href = this.navigateUrl)
      }
      return window.location.reload()
    }
    const { showSnackMessage } = this.props
    showSnackMessage(
      generateSnackMessage(
        { message: 'Service Worker Installed' },
        showSnackMessage
      )
    )
  }

  private onSWWaiting = () => {
    Router.push = wrap(this.onRouteChange, originalPush)
    Router.replace = wrap(this.onRouteChange, originalReplace)
    this.setState({
      swUpdateWaiting: true,
    })
    // There is a new version of Service Worker.
    // And now there are two of them.
    // Show the user that he can upgrade
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

  private onRouteChange = async (url: string) => {
    if (!this.registration || !this.registration.waiting) return false
    const count = await this.clientCount()
    if (count > 1) return false
    this.navigateUrl = url
    this.upgradeServiceWorker()
    return true
  }

  private onReloadClick = async () => {
    if (!this.registration || !this.registration.active) return
    const { showSnackMessage } = this.props
    const count = await this.clientCount()
    if (count > 1) {
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

  private async clientCount(): Promise<number> {
    if (!this.registration || !this.registration.active) return 1
    return await messageSW(this.registration.active, {
      type: 'CLIENTS_COUNT',
    })
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

  private checkForUpdates = async () => {
    if (!this.wb) return
    try {
      await this.wb.update()
    } finally {
      setTimeout(this.checkForUpdates, HOUR_IN_MS)
    }
  }

  render() {
    return null
  }
}
