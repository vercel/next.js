import Layout from "../../components/Layout";
import { getPayloadClient } from "../../payload/payloadClient";

const SiteLayout = async ({ children }: { children: React.ReactNode }) => {
  const payload = await getPayloadClient();

  const mainMenu = await payload.findGlobal({
    slug: "main-menu",
  });

  return <Layout mainMenu={mainMenu}>{children}</Layout>;
};

export default SiteLayout;
