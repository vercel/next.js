import { NextApiRequest, NextApiResponse } from "next";
import { exitPreview } from "@prismicio/next";

export default async function exit(req: NextApiRequest, res: NextApiResponse) {
  exitPreview({ res, req });
}
