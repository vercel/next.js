import '../global.css'
import { Base } from '../styles/base'
import { Colors } from '../styles/colors'
import { ComponentStyles } from '../styles/component-styles'
import { ShadowPortal } from '../components/shadow-portal'
import { DarkTheme } from '../styles/dark-theme'

export const withShadowPortal = (Story: any) => (
  <ShadowPortal>
    <Base />
    <Colors />
    <ComponentStyles />
    <DarkTheme />
    <Story />
  </ShadowPortal>
)
