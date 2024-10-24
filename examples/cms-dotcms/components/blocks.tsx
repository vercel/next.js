import cn from "classnames";
import DotCmsImage from "./dotcms-image";
import Link from "next/link";

export const Bold = ({ children }) => <strong>{children}</strong>;
export const Italic = ({ children }) => <em>{children}</em>;
export const Strike = ({ children }) => <s>{children}</s>;
export const Underline = ({ children }) => <u>{children}</u>;
export const DotLink = ({ attrs: { href, target }, children }) => {
  const regEx = /https?:\/\//;

  return regEx.test(href) ? (
    <a href={href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  ) : (
    <Link href={href} target={target || "_self"} legacyBehavior>
      {children}
    </Link>
  );
};

const nodeMarks = {
  link: DotLink,
  bold: Bold,
  underline: Underline,
  italic: Italic,
  strike: Strike,
};

export const TextNode = (props) => {
  const { marks = [], text } = props;
  const mark = marks[0] || { type: "", attrs: {} };
  const newProps = { ...props, marks: marks.slice(1) };
  const Component = nodeMarks[mark?.type];

  if (!Component) {
    return text;
  }

  return (
    <Component attrs={mark.attrs}>
      <TextNode {...newProps} />
    </Component>
  );
};

export const DotImage = ({ attrs: { textAlign, data } }) => {
  const { asset, title } = data;
  const [imgTitle] = title.split(".");

  return (
    <DotCmsImage
      objectFit="cover"
      style={{ textAlign: textAlign }}
      width="800"
      height="400"
      alt={`Cover Image for ${title}`}
      className={cn("shadow-small", {
        "hover:shadow-medium transition-shadow duration-200": imgTitle,
      })}
      src={asset}
    />
  );
};

export const ListItem = ({ children }) => {
  return <li>{children}</li>;
};

export const OrderedList = ({ children }) => {
  return <ol>{children}</ol>;
};

export const Paragraph = ({ children }) => {
  return <p>{children}</p>;
};

export const BulletList = ({ children }) => {
  return <ul>{children}</ul>;
};

export const Heading = ({ level, children }) => {
  const Tag = `h${level}` as keyof JSX.IntrinsicElements;
  return <Tag>{children}</Tag>;
};

export const BlockQuote = ({ children }) => {
  return <blockquote>{children}</blockquote>;
};

export const CodeBlock = ({ language, children }) => {
  return (
    <pre data-language={language}>
      <code>{children}</code>
    </pre>
  );
};
