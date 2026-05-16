import handler from "@payloadcms/next-payload/dist/handlers/[collection]";

export default handler;

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};
