import handler from "@payloadcms/next-payload/dist/handlers/graphql";

export default handler;

export const config = {
  api: {
    externalResolver: true,
  },
};
