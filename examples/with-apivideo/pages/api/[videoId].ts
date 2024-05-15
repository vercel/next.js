import type { NextApiRequest, NextApiResponse } from "next";
import ApiVideoClient from "@api.video/nodejs-client";

const getVideoStatus = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { videoId } = req.query;
    const client = new ApiVideoClient({ apiKey: process.env.API_KEY });
    const status = await client.videos.getStatus(videoId as string);
    res.status(200).json({ status });
  } catch (error) {
    res.status(400).end();
  }
};

export default getVideoStatus;
