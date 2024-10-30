import { useEffect, useState } from "react";
import { requireComponentDependancyByName } from "../dependancies";

export default function CMSPageTemplate(props) {
  const [Component, setComponent] = useState(null);

  useEffect(() => {
    const loadTemplate = async () => {
      try {
        const DynamicComponent = await requireComponentDependancyByName(props.pageTemplateName);
        setComponent(() => DynamicComponent);
      } catch (error) {
        console.error('failed to load component', error);
      }
    };
    loadTemplate();
  }, [props.pageTemplateName]);

  if (!Component) {
    return <div>Loading...</div>;
  }

  return <Component {...props} />;
}
