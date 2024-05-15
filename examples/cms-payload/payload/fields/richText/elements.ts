import { RichTextElement } from "payload/dist/fields/config/types";
import label from "./label";
import largeBody from "./largeBody";

const elements: RichTextElement[] = [
  "blockquote",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "link",
  largeBody,
  label,
];

export default elements;
