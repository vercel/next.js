import handler from "@payloadcms/next-payload/dist/handlers/[collection]/forgot-password";

export default handler;

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};
