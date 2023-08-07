import { BaseIcon, IconProps } from './BaseIcon'

export const CloseIcon = (props: IconProps) => {
  return (
    <BaseIcon {...props}>
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </BaseIcon>
  )
}
