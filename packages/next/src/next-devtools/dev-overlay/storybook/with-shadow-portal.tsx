import '../global.css'
import { ComponentStyles } from '../styles/component-styles'
import { ShadowPortal } from '../components/shadow-portal'

export const withShadowPortal = (Story: any) => (
  <ShadowPortal>
    <ComponentStyles />
    <Story />
  </ShadowPortal>
)
