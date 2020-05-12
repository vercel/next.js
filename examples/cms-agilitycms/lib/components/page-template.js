import { requireComponentDependancyByName } from '../dependancies'

export default function CMS_PageTemplate(props) {
    const AgilityPageTemplateToRender = requireComponentDependancyByName(props.pageTemplateName);
    return (
        <AgilityPageTemplateToRender {...props} />
    )
  }
  