import type { NextApiRequest, NextApiResponse } from "next";
import Mux from "@mux/mux-node";
const { Video } = new Mux();

export default async function uploadHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { method } = req;

  switch (method) {
    case "GET":
      try {
        const upload = await Video.Uploads.get(req.query.id as string);
        res.json({
          upload: {
            status: upload.status,
            url: upload.url,
            asset_id: upload.asset_id,
          },
        });
      } catch (e) {
        console.error("Request error", e);
        res.status(500).json({ error: "Error getting upload/asset" });
      }
      break;
    default:
      res.setHeader("Allow", ["GET"]);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}
