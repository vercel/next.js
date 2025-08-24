import handler from "@payloadcms/next-payload/dist/handlers/access";

export default handler;

export const config = {
  api: {
    externalResolver: true,
  },
};
