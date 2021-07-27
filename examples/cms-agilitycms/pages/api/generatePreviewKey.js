import { generatePreviewKey } from "@agility/nextjs/node";

export default async (req, res) => {
  //TODO: Only generate the preview link if you are already in Preview!
  const previewKey = generatePreviewKey();

  //Return a valid preview key
  res.end(previewKey);
};
