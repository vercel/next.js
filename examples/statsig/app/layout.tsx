import BootstrappedStatsigProvider from "@/components/bootstrapped-statsig-provider";
import { getStableId, getStatsigValues } from "@/lib/statsig-helpers";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let stableID = getStableId();
  if (!stableID) {
    console.warn("StableID not set by middleware.ts");
    stableID = "";
  }

  const user = { customIDs: { stableID } };
  const { values, clientKey } = await getStatsigValues(user);

  return (
    <html>
      <body style={{ backgroundColor: "#1B2528" }}>
        <BootstrappedStatsigProvider
          clientKey={clientKey}
          initialUser={user}
          initialValues={values}
        >
          {children}
        </BootstrappedStatsigProvider>
      </body>
    </html>
  );
}
