import React from 'react'
import Router from 'next/router'
import { Workbox, messageSW } from 'workbox-window'
import Button from '@material-ui/core/Button'
import { SnackbarProps, generateSnackMessage } from '../components/SnackBar'
import { WorkboxLifecycleEvent } from 'workbox-window/utils/WorkboxEvent'
import { formatWithValidation } from 'next-server/dist/lib/utils'

type ShowSnack = (props: SnackbarProps) => void
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

let registrationStarted = false

export default async function registerServiceWorker(showSnack: ShowSnack) {
  let navigateUrl: string | undefined
  let refreshing: boolean = false
  if (registrationStarted) return
  if (!navigator.serviceWorker) return
  registrationStarted = true

  const wb = new Workbox('/sw.js')
  const registration = await wb.register()
  if (registration && registration.waiting) {
    onSWWaiting()
  }
  wb.addEventListener('activated', onSWActivated)
  wb.addEventListener('externalactivated', onSWActivated)
  wb.addEventListener('externalwaiting', onSWWaiting)
  wb.addEventListener('waiting', onSWWaiting)
  setTimeout(checkForUpdates, HOUR_IN_MS)

  function onSWActivated(ev: WorkboxLifecycleEvent) {
    if (ev.isUpdate) {
      if (refreshing) return
      // New Service Worker has been activated.
      // You will need to refresh the page.
      refreshing = true
      if (navigateUrl) {
        return (window.location.href = navigateUrl)
      }
      return window.location.reload()
    }

    showSnack(
      generateSnackMessage({ message: 'Service Worker Installed' }, showSnack)
    )
  }

  function onSWWaiting() {
    Router.push = wrap(onRouteChange, originalPush)
    Router.replace = wrap(onRouteChange, originalReplace)
    // There is a new version of Service Worker.
    // And now there are two of them.
    // Show the user that he can upgrade

    showSnack(
      generateSnackMessage(
        {
          message: 'A new version is now available',
          action: (
            <Button
              key="undo"
              color="secondary"
              size="small"
              onClick={onReloadClick}
            >
              RELOAD
            </Button>
          ),
        },
        showSnack
      )
    )
  }

  async function onRouteChange(url: string) {
    if (!registration || !registration.waiting) return false
    const count = await clientCount()
    if (count > 1) return false
    navigateUrl = url
    upgradeServiceWorker()
    return true
  }

  async function onReloadClick() {
    if (!registration || !registration.active) return

    const count = await clientCount()
    if (count > 1) {
      return showSnack(
        generateSnackMessage(
          {
            message:
              'You have other tabs open. You might lose unsaved data on those tabs',
            action: (
              <Button
                key="undo"
                color="secondary"
                size="small"
                onClick={upgradeServiceWorker}
              >
                RELOAD THEM ALL?
              </Button>
            ),
          },
          showSnack
        )
      )
    }
    upgradeServiceWorker()
  }

  async function clientCount(): Promise<number> {
    if (!registration || !registration.active) return 1
    return await messageSW(registration.active, {
      type: 'CLIENTS_COUNT',
    })
  }

  async function upgradeServiceWorker() {
    showSnack({ open: false })
    if (registration && registration.waiting) {
      registration.waiting.postMessage({
        type: 'SKIP_WAITING',
      })
    }
  }

  async function checkForUpdates() {
    if (!wb) return
    try {
      await wb.update()
    } finally {
      setTimeout(checkForUpdates, HOUR_IN_MS)
    }
  }
}
