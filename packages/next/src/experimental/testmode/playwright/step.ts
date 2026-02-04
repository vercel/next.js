import type { TestInfo } from '@playwright/test'
import { test } from '@playwright/test'

export interface StepProps {
  category: string
  title: string
  apiName?: string
  params?: Record<string, string | number | boolean | null | undefined>
}

type Complete = (result: { error?: any }) => void

export async function step<T>(
  _testInfo: TestInfo,
  props: StepProps,
  handler: (complete: Complete) => Promise<Awaited<T>>
): Promise<Awaited<T>> {
  let result: Awaited<T>
  let reportedError: any
  try {
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
