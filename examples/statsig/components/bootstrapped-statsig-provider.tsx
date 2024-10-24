"use client";

import {
  LogLevel,
  StatsigProvider,
  StatsigUser,
  useClientBootstrapInit,
} from "@statsig/react-bindings";

export default function BootstrappedStatsigProvider({
  clientKey,
  initialUser,
  initialValues,
  children,
}: {
  clientKey: string;
  initialUser: StatsigUser;
  initialValues: string;
  children: React.ReactNode;
}) {
  const client = useClientBootstrapInit(clientKey, initialUser, initialValues, {
    logLevel: LogLevel.Debug,
    environment: { tier: "development" },
    networkConfig: {
      logEventUrl: "/statsig-proxy/log_event",
      initializeUrl: "/statsig-proxy/initialize",
    },
    disableCompression: true,
    disableStatsigEncoding: true,
  });

  return <StatsigProvider client={client}>{children}</StatsigProvider>;
}
