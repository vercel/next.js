import type { TestInfo } from '@playwright/test'
// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from '@playwright/test'

export interface StepProps {
  category: string
  title: string
  apiName?: string
  params?: Record<string, string | number | boolean | null | undefined>
}

// Access the internal Playwright API until it's exposed publicly.
// See https://github.com/microsoft/playwright/issues/27059.
interface TestInfoWithRunAsStep extends TestInfo {
  _runAsStep: <T>(
    stepInfo: StepProps,
    handler: (result: { complete: Complete }) => Promise<T>
  ) => Promise<T>
}

type Complete = (result: { error?: any }) => void

function isWithRunAsStep(
  testInfo: TestInfo
): testInfo is TestInfoWithRunAsStep {
  return '_runAsStep' in testInfo
}

export async function step<T>(
  testInfo: TestInfo,
  props: StepProps,
  handler: (complete: Complete) => Promise<Awaited<T>>
): Promise<Awaited<T>> {
  if (isWithRunAsStep(testInfo)) {
    return testInfo._runAsStep(props, ({ complete }) => handler(complete))
  }

  // Fallback to the `test.step()`.
  let result: Awaited<T>
  let reportedError: any
  try {
    console.log(props.title, props)
    await test.step(props.title, async () => {
      result = await handler(({ error }) => {
        reportedError = error
        if (reportedError) {
          throw reportedError
        }
      })
    })
  } catch (error) {
    if (error !== reportedError) {
      throw error
    }
  }
  return result!
}
