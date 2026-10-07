"use client";
import { observer } from "mobx-react-lite";
import Link from "next/link";
import { useEffect } from "react";
import Clock from "../Clock";
import { useStore } from "../StoreProvider";

const Page = observer(({ title, linkTo }) => {
  const store = useStore();

  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);

  return (
    <div>
      <h1>{title}</h1>
      <Clock />
      <nav>
        <Link href={linkTo}>Navigate</Link>
      </nav>
    </div>
  );
});

export default Page;
