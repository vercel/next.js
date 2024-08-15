import Image from "next/image";

export default function PostBody({ content }) {
  const renderedContent = content.map((item) => {
    if (item.__typename === "Text") {
      return <div dangerouslySetInnerHTML={{ __html: item.html }}></div>;
    } else if (item.__typename === "Image") {
      return <Image src={item.url} alt="image" width={1000} height={500} />;
    } else {
      return null;
    }
  });

  return <div className="max-w-2xl mx-auto article">{renderedContent}</div>;
}
