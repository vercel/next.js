import React from "react";
import {
  ComponentParams,
  ComponentRendering,
  Placeholder,
} from "@sitecore-jss/sitecore-jss-nextjs";

interface ComponentProps {
  rendering: ComponentRendering & { params: ComponentParams };
  params: ComponentParams;
}

export const Default = (props: ComponentProps): JSX.Element => {
  const styles = `${props.params.GridParameters ?? ""} ${
    props.params.Styles ?? ""
  }`.trimEnd();
  const rowStyles = [
    props.params.Styles1,
    props.params.Styles2,
    props.params.Styles3,
    props.params.Styles4,
    props.params.Styles5,
    props.params.Styles6,
    props.params.Styles7,
    props.params.Styles8,
  ];
  const enabledPlaceholders = props.params.EnabledPlaceholders.split(",");
  const id = props.params.RenderingIdentifier;

  return (
    <div
      className={`component row-splitter ${styles}`}
      id={id ? id : undefined}
    >
      {enabledPlaceholders.map((ph, index) => {
        const phKey = `row-${ph}-{*}`;
        const phStyles = `${rowStyles[+ph - 1] ?? ""}`.trimEnd();

        return (
          <div key={index} className={`container-fluid ${phStyles}`.trimEnd()}>
            <div key={index}>
              <div key={index} className="row">
                <Placeholder
                  key={index}
                  name={phKey}
                  rendering={props.rendering}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
