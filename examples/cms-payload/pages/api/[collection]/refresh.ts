import meHandler from "@payloadcms/next-payload/dist/handlers/[collection]/me";

export default meHandler;

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};
