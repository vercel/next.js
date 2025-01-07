import { Base } from '../styles/Base'
import { Colors } from '../styles/colors'
import { CssReset } from '../styles/CssReset'
import { ComponentStyles } from '../styles/ComponentStyles'
import { ShadowPortal } from '../components/ShadowPortal'

export const withShadowPortal = (Story: any) => (
  <ShadowPortal>
    <CssReset />
    <Base />
    <Colors />
    <ComponentStyles />
    <Story />
  </ShadowPortal>
)
