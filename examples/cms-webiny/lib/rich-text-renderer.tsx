import * as React from "react";
import classNames from "classnames";

const renderParagraph = (block) => {
  const props = { style: {}, className: "" };

  if (block.data.textAlign) {
    props.style["textAlign"] = block.data.textAlign;
  }
  if (block.data.className) {
    props.className = block.data.className;
  }
  return (
    <p
      {...props}
      className={classNames("rte-block-paragraph", props.className)}
      dangerouslySetInnerHTML={{ __html: block.data.text }}
    />
  );
};

const renderDelimiter = () => {
  return <div className="rte-block-delimiter" />;
};

const renderHeader = (block) => {
  const props = { style: {}, className: "" };

  if (block.data.textAlign) {
    props.style["textAlign"] = block.data.textAlign;
  }
  if (block.data.className) {
    props.className = block.data.className;
  }

  switch (block.data.level) {
    case 1:
      return (
        <h1
          {...props}
          className={classNames(
            props.className,
            "rte-block-heading rte-block-heading--h1",
          )}
          dangerouslySetInnerHTML={{ __html: block.data.text }}
        />
      );

    case 2:
      return (
        <h2
          {...props}
          className={classNames(
            props.className,
            "rte-block-heading rte-block-heading--h2",
          )}
          dangerouslySetInnerHTML={{ __html: block.data.text }}
        />
      );

    case 3:
      return (
        <h3
          {...props}
          className={classNames(
            props.className,
            "rte-block-heading rte-block-heading--h3",
          )}
          dangerouslySetInnerHTML={{ __html: block.data.text }}
        />
      );

    case 4:
      return (
        <h4
          {...props}
          className={classNames(
            props.className,
            "rte-block-heading rte-block-heading--h4",
          )}
          dangerouslySetInnerHTML={{ __html: block.data.text }}
        />
      );

    case 5:
      return (
        <h5
          {...props}
          className={classNames(
            props.className,
            "rte-block-heading rte-block-heading--h5",
          )}
          dangerouslySetInnerHTML={{ __html: block.data.text }}
        />
      );

    case 6:
      return (
        <h6
          {...props}
          className={classNames(
            props.className,
            "rte-block-heading rte-block-heading--h6",
          )}
          dangerouslySetInnerHTML={{ __html: block.data.text }}
        />
      );
    default:
      return null;
  }
};

function renderImage(block) {
  return (
    <img
      className={"rte-block-image"}
      alt={block.data.caption}
      src={block.data.file}
    />
  );
}

function renderList(block) {
  switch (block.data.style) {
    case "unordered":
      return (
        <ul className={"rte-block-list"}>
          {block.data.items.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
      );

    case "ordered":
      return (
        <ol className={"rte-block-list"}>
          {block.data.items.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ol>
      );
    default:
      return null;
  }
}

function renderQuote(block) {
  return (
    <blockquote className={"rte-block-blockquote"}>
      <p>{block.data.text}</p>
    </blockquote>
  );
}

const defaultRenderers = {
  delimiter: renderDelimiter,
  header: renderHeader,
  image: renderImage,
  list: renderList,
  paragraph: renderParagraph,
  quote: renderQuote,
};

export const RichTextRenderer = (props) => {
  // Combine default renderers with custom renderers
  const renderers = Object.assign({}, defaultRenderers, props.renderers);

  return (
    <React.Fragment>
      {props.data.map((block, index) => {
        const renderer = renderers[block.type];
        if (!renderer) {
          return null;
        }

        const node = renderer(block);
        if (React.isValidElement(node)) {
          return React.cloneElement(node, { key: index });
        }

        return null;
      })}
    </React.Fragment>
  );
};
