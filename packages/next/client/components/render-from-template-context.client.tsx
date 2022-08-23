import { useContext } from 'react'
import { TemplateContext } from '../../shared/lib/app-router-context'

export default function RenderFromTemplateContext() {
  const children = useContext(TemplateContext)
  return children
}
