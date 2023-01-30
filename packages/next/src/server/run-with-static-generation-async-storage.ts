import type { StaticGenerationAsyncStorage } from '../client/components/static-generation-async-storage'
import type { RenderOpts } from './app-render'
import { StaticGenerationAsyncStorageWrapper } from './async-storage/static-generation-async-storage-wrapper'

type RunWithStaticGenerationAsyncStorageContext = {
  pathname: string
  renderOpts: RenderOpts
}

const wrapper = new StaticGenerationAsyncStorageWrapper()

export function runWithStaticGenerationAsyncStorage<Result>(
  staticGenerationAsyncStorage: StaticGenerationAsyncStorage,
  context: RunWithStaticGenerationAsyncStorageContext,
  callback: () => Promise<Result>
): Promise<Result> {
  return wrapper.wrap(staticGenerationAsyncStorage, context, callback)
}
