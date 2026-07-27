import { requireComponentDependencyByName } from "../dependencies";

export default function CMSPageTemplate(props) {
  const AgilityPageTemplateToRender = requireComponentDependencyByName(
    props.pageTemplateName,
  );
  return <AgilityPageTemplateToRender {...props} />;
}
