import Voidfull from "@voidfull/js-sdk";

const siteId = process.env.NEXT_PUBLIC_VOIDFULL_SITE_ID as string;
const token = process.env.NEXT_PUBLIC_VOIDFULL_CONTENT_TOKEN;

const Client = new Voidfull({
  siteId,
  token,
});

export { Client };
