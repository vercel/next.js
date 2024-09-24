import type { NextApiRequest, NextApiResponse } from "next";

const regenerate = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.query.secret !== process.env.NEXT_PRIVATE_REGENERATION_SECRET) {
    console.error("Error regenerating: Invalid Token.");
    return res
      .status(401)
      .json({ message: "Error regenerating:  Invalid token" });
  }

  if (typeof req.query.path === "string") {
    try {
      const url = new URL(req.query.path, process.env.NEXT_PUBLIC_APP_URL);
      const { pathname: pathToRegenerate } = url;
      await res.revalidate(pathToRegenerate);
      return res.json({ regenerated: true });
    } catch (err) {
      console.error("Error regenerating: Cannot parse url.");
      return res.status(500).send("Error regenerating: Cannot parse url.");
    }
  }

  return res.status(400).send("No path to regenerate");
};

export default regenerate;
