import { RichTextCustomElement } from "payload/types";
import Button from "./Button";
import Element from "./Element";
import withLabel from "./plugin";

export default {
  name: "label",
  Button,
  Element,
  plugins: [withLabel],
} as RichTextCustomElement;
