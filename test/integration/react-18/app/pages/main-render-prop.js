import { useContext } from 'react'
import Context from '../components/context'

export default function MainRenderProp() {
  const value = useContext(Context)
  return value
}
