import '../../src/next-devtools/dev-overlay/global.css'
import { ComponentStyles } from '../../src/next-devtools/dev-overlay/styles/component-styles'
import { ShadowPortal } from '../../src/next-devtools/dev-overlay/components/shadow-portal'

export const withShadowPortal = (Story: any) => (
  <ShadowPortal>
    <ComponentStyles />
    <Story />
  </ShadowPortal>
)
