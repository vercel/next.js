import './index.css'
import InputText from './layout-input'

export default function Layout({ children }) {
  return (
    <div>
      {children}
      <InputText />
    </div>
  )
}
