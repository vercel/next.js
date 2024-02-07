"use client";

import React, { useState, useEffect } from "react";
import { SessionAuth } from "supertokens-auth-react/recipe/session";

type Props = Parameters<typeof SessionAuth>[0] & {
  children?: React.ReactNode | undefined;
};

export const SessionAuthForNextJS = (props: Props) => {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(true);
  }, []);
  if (!loaded) {
    return props.children;
  }
  return <SessionAuth {...props}>{props.children}</SessionAuth>;
};
