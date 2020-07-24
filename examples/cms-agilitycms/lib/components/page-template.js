import { requireComponentDependancyByName } from '../dependancies'

export default function CMSPageTemplate(props) {
  const AgilityPageTemplateToRender = requireComponentDependancyByName(
    props.pageTemplateName
  )
  return <AgilityPageTemplateToRender {...props} />
}
