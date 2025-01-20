import { Base } from '../styles/base'
import { Colors } from '../styles/colors'
import { CssReset } from '../styles/css-reset'
import { ComponentStyles } from '../styles/component-styles'
import { ShadowPortal } from '../components/shadow-portal'

export const withShadowPortal = (Story: any) => (
  <ShadowPortal>
    <CssReset />
    <Base />
    <Colors />
    <ComponentStyles />
    <Story />
  </ShadowPortal>
)
