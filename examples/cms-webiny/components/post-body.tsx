import markdownStyles from "./markdown-styles.module.css";
import { RichTextRenderer } from "../lib/rich-text-renderer";

export default function PostBody({ content }) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className={markdownStyles["markdown"]}>
        <RichTextRenderer data={content} />
      </div>
    </div>
  );
}
