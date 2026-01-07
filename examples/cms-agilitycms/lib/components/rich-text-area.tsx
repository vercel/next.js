const setHTML = (textblob) => {
  return { __html: textblob };
};

export default function RichTextArea({ fields }) {
  const { textblob } = fields;
  return (
    <div
      className="default-rich-text-area"
      dangerouslySetInnerHTML={setHTML(textblob)}
    />
  );
}
