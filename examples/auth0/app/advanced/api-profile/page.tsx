"use client";

import { useEffect, useState } from "react";

export default function ApiProfile() {
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/protected-api");
      const json = await res.json();
      setData(json);
    })();
  }, []);

  return (
    <>
      <h1>Profile</h1>
      <div>
        <h3>Public page (client rendered)</h3>
        <p>We are fetching data on the client-side:</p>
        <p>By making request to &apos;/api/protected-api&apos; route handler</p>
        <p>so without a valid session cookie will fail</p>
        <p>{JSON.stringify(data)}</p>
      </div>
    </>
  );
}
