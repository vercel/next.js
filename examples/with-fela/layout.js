import { Provider } from 'react-fela'
import felaRenderer from './fela-renderer'

export default ({ children }) =>
  <Provider renderer={felaRenderer}>
    {children}
  </Provider>
