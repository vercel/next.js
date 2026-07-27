import handler from "@payloadcms/next-payload/dist/handlers/[collection]/login";

export default handler;

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};
