import handler from "@payloadcms/next-payload/dist/handlers/globals/[global]";

export default handler;

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};
