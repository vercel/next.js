import { createPullstateCore } from 'pullstate'

import { UIStore } from './ui'

export const PullstateCore = createPullstateCore({
  UIStore,
})
