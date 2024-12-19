import { Base } from '../styles/Base'
import { CssReset } from '../styles/CssReset'
import { ComponentStyles } from '../styles/ComponentStyles'
import { ShadowPortal } from '../components/ShadowPortal'

export const withShadowPortal = (Story: any) => (
  <ShadowPortal>
    <CssReset />
    <Base />
    <ComponentStyles />
    <Story />
  </ShadowPortal>
)
