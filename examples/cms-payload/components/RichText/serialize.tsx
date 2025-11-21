import React, { Fragment } from "react";
import escapeHTML from "escape-html";
import { Text } from "slate";
import { Label } from "../Label";
import { LargeBody } from "../LargeBody";

// eslint-disable-next-line no-use-before-define
type Children = Leaf[];

type Leaf = {
  type: string;
  value?: {
    url: string;
    alt: string;
  };
  children: Children;
  url?: string;
  [key: string]: unknown;
};

const serialize = (children: Children): React.ReactNode[] =>
  children.map((node, i) => {
    if (Text.isText(node)) {
      let text = (
        <span dangerouslySetInnerHTML={{ __html: escapeHTML(node.text) }} />
      );

      if (node.bold) {
        text = <strong key={i}>{text}</strong>;
      }

      if (node.code) {
        text = <code key={i}>{text}</code>;
      }

      if (node.italic) {
        text = <em key={i}>{text}</em>;
      }

      if (node.underline) {
        text = (
          <span style={{ textDecoration: "underline" }} key={i}>
            {text}
          </span>
        );
      }

      if (node.strikethrough) {
        text = (
          <span style={{ textDecoration: "line-through" }} key={i}>
            {text}
          </span>
        );
      }

      return <Fragment key={i}>{text}</Fragment>;
    }

    if (!node) {
      return null;
    }

    switch (node.type) {
      case "h1":
        return <h1 key={i}>{serialize(node.children)}</h1>;
      case "h2":
        return <h2 key={i}>{serialize(node.children)}</h2>;
      case "h3":
        return <h3 key={i}>{serialize(node.children)}</h3>;
      case "h4":
        return <h4 key={i}>{serialize(node.children)}</h4>;
      case "h5":
        return <h5 key={i}>{serialize(node.children)}</h5>;
      case "h6":
        return <h6 key={i}>{serialize(node.children)}</h6>;
      case "quote":
        return <blockquote key={i}>{serialize(node.children)}</blockquote>;
      case "ul":
        return <ul key={i}>{serialize(node.children)}</ul>;
      case "ol":
        return <ol key={i}>{serialize(node.children)}</ol>;
      case "li":
        return <li key={i}>{serialize(node.children)}</li>;
      case "link":
        return (
          <a href={escapeHTML(node.url)} key={i}>
            {serialize(node.children)}
          </a>
        );

      case "label":
        return <Label key={i}>{serialize(node.children)}</Label>;

      case "large-body": {
        return <LargeBody key={i}>{serialize(node.children)}</LargeBody>;
      }

      default:
        return <p key={i}>{serialize(node.children)}</p>;
    }
  });

export default serialize;
