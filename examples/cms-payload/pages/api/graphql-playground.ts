import handler from "@payloadcms/next-payload/dist/handlers/graphql-playground";

export default handler;

export const config = {
  api: {
    externalResolver: true,
  },
};
