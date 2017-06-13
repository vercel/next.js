import { Provider } from 'react-fela'
import getRenderer from './fela'

export default ({ children }) => (
  <Provider renderer={getRenderer()}>
    {children}
  </Provider>
)
