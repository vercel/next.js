import { useContext } from 'react'
import Context from '../lib/context'

export default function MainRenderProp() {
  const value = useContext(Context)
  return <span>{value}</span>
}
