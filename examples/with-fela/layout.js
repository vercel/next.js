import { Provider } from 'react-fela'
import { getRenderer, getMountNode } from './fela'

export default ({ children }) => (
  <Provider renderer={getRenderer()} mountNode={getMountNode()}>
    {children}
  </Provider>
)
