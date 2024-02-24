import handler from "@payloadcms/next-payload/dist/handlers/[collection]/first-register";

export default handler;

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};
