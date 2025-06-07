import React from "react";

export default function Paragraph(props) {
  return (
    <div
      className="Paragraph"
      dangerouslySetInnerHTML={{ __html: props.richText }}
    />
  );
}
