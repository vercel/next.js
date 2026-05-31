'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { writeReconcile } from './reconcile-store'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Long enough that parallel calls clearly overlap, short enough that 3 serial
// calls still finish inside the retry window.
const WORK_MS = 400

export type Span = {
  label: string
  start: number
  end: number
  // What a writing action stored; used by the reconcile test.
  value?: number
}

// A read-only server action.
export async function slowRead(label: string): Promise<Span> {
  const start = Date.now()
  await sleep(WORK_MS)
  return { label, start, end: Date.now() }
}

// A fast read, to show a quick call can return without waiting for slow ones.
export async function fastRead(label: string): Promise<Span> {
  const start = Date.now()
  await sleep(50)
  return { label, start, end: Date.now() }
}

// A mutating action: writes its own cookie and returns its span. Each call uses
// a different cookie name, so the test can confirm every call applied (no lost
// update). Cookies travel with the browser, so this also works on deploy.
// Non-httpOnly so the test can read it from document.cookie.
export async function mutate(label: string): Promise<Span> {
  const start = Date.now()
  await sleep(WORK_MS)
  ;(await cookies()).set(`psf-mut-${label}`, '1', {
    httpOnly: false,
    path: '/',
  })
  return { label, start, end: Date.now() }
}

// Used to prove failures are isolated per call.
export async function maybeFail(
  label: string,
  shouldFail: boolean
): Promise<Span> {
  const start = Date.now()
  await sleep(WORK_MS)
  if (shouldFail) {
    throw new Error(`psf-fail-${label}`)
  }
  return { label, start, end: Date.now() }
}

// An action that redirects, to exercise redirect handling on the parallel path.
export async function redirectFromAction(target: string): Promise<void> {
  await sleep(50)
  redirect(target)
}

// Slow and revalidating, for the navigation-race test. Revalidating makes it
// commit (not just resolve a value) and makes the server send page data. That
// data is the stale input a broken commit would wrongly apply to the new route.
export async function slowRevalidate(): Promise<void> {
  await sleep(1000)
  revalidatePath('/origin')
}

// A slow redirect, for the redirect race. Slow enough that a navigation lands
// first, so the redirect arrives stale.
export async function slowRedirect(target: string): Promise<void> {
  await sleep(1500)
  redirect(target)
}

// For the reconcile test. Each action writes its number to the shared cookie and
// revalidates, so it commits (instead of resolving off-queue). The delays differ
// by 100ms, so the one writing 3 finishes last and the final value is 3 however
// the commits race. A dynamic component reads it, so the refresh must bring the
// UI to 3.
export async function resetReconcile(): Promise<void> {
  await writeReconcile(0)
}

export async function reconcileOne(): Promise<Span> {
  const start = Date.now()
  await sleep(300)
  await writeReconcile(1)
  revalidatePath('/reconcile')
  return { label: 'one', start, end: Date.now(), value: 1 }
}

export async function reconcileTwo(): Promise<Span> {
  const start = Date.now()
  await sleep(400)
  await writeReconcile(2)
  revalidatePath('/reconcile')
  return { label: 'two', start, end: Date.now(), value: 2 }
}

export async function reconcileThree(): Promise<Span> {
  const start = Date.now()
  await sleep(500)
  await writeReconcile(3)
  revalidatePath('/reconcile')
  return { label: 'three', start, end: Date.now(), value: 3 }
}
