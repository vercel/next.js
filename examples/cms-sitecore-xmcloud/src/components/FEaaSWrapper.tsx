import {
  FEaaSComponent,
  FEaaSComponentProps,
} from "@sitecore-jss/sitecore-jss-nextjs";
import React from "react";

export const Default = (props: FEaaSComponentProps): JSX.Element => {
  const styles = `component feaas ${props.params?.styles}`.trimEnd();
  const id = props.params?.RenderingIdentifier;

  return (
    <div className={styles} id={id ? id : undefined}>
      <div className="component-content">
        <FEaaSComponent {...props} />
      </div>
    </div>
  );
};
