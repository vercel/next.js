"use client";

import React from "react";
import Root from "payload/dist/admin/Root";

const PayloadAdmin = () => {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return <Root />;
};

export default PayloadAdmin;
