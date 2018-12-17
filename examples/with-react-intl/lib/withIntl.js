import hoistNonReactStatics from 'hoist-non-react-statics'
import { injectIntl } from 'react-intl'

export const hoistStatics = higherOrderComponent => BaseComponent => {
  const NewComponent = higherOrderComponent(BaseComponent)
  hoistNonReactStatics(NewComponent, BaseComponent)

  return NewComponent
}

export default hoistStatics(injectIntl)
