import type { NextApiRequest, NextApiResponse } from "next";
import { getXataClient } from "../../utils/xata.codegen";

const LINKS = [
  {
    description: "Everything you need to know about Xata APIs and tools.",
    title: "Xata Docs",
    url: "https://xata.io/docs",
  },
  {
    description: "In case you need to check some Next.js specifics.",
    title: "Next.js Docs",
    url: "https://nextjs.org/docs",
  },
  {
    description:
      "Maintain your flow by managing your Xata Workspace without ever leaving VS Code.",
    title: "Xata VS Code Extension",
    url: "https://marketplace.visualstudio.com/items?itemName=xata.xata",
  },
  {
    description: "Get help. Offer help. Show us what you built!",
    title: "Xata Discord",
    url: "https://xata.io/discord",
  },
];

const xata = getXataClient();

export default async function writeLinksToXata(
  _req: NextApiRequest,
  res: NextApiResponse,
) {
  await xata.db.nextjs_with_xata_example.create(LINKS);
  res.json({
    ok: true,
  });
}
