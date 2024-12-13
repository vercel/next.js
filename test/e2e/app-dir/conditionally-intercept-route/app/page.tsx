import Link from 'next/link'
import ButtonWithRouterAction from './_components/button-with-router-action'

export default function Page() {
  return (
    <>
      <div>
        <Link id="explicitly-not-intercepted" intercept={false} href="route">
          Open route (Non-intercepted);
        </Link>
      </div>
      <div>
        <Link id="explicitly-intercepted" intercept={true} href="route">
          Open route (intercepted);
        </Link>
      </div>
      <div>
        <Link id="default-behavior" href="route">
          Open route (intercepted, default);
        </Link>
      </div>
      <div>
        <ButtonWithRouterAction
          id={'router-push-explicitly-not-intercepted'}
          href="route"
          intercept={false}
          action={'push'}
        >
          Open route via router.push (non-intercepted, explicit opt-out)
        </ButtonWithRouterAction>
      </div>
      <div>
        <ButtonWithRouterAction
          id={'router-push-default-behavior'}
          href="route"
          action={'push'}
        >
          Open route via router.push (intercepted, default)
        </ButtonWithRouterAction>
      </div>
      <div>
        <ButtonWithRouterAction
          id={'router-push-explicitly-intercepted'}
          href="route"
          intercept={true}
          action={'push'}
        >
          Open route via router.push (intercepted, explicit opt-in)
        </ButtonWithRouterAction>
      </div>
      <div>
        <ButtonWithRouterAction
          id={'router-replace-explicitly-not-intercepted'}
          href="route"
          intercept={false}
          action={'replace'}
        >
          Open route via router.replace (non-intercepted, explicit opt-out)
        </ButtonWithRouterAction>
      </div>
      <div>
        <ButtonWithRouterAction
          id={'router-replace-default-behavior'}
          href="route"
          action={'replace'}
        >
          Open route via router.replace (intercepted, default)
        </ButtonWithRouterAction>
      </div>
      <div>
        <ButtonWithRouterAction
          id={'router-replace-explicitly-intercepted'}
          href="route"
          intercept={true}
          action={'replace'}
        >
          Open route via router.replace (intercepted, explicit opt-in)
        </ButtonWithRouterAction>
      </div>
    </>
  )
}
