import { observer } from "mobx-react-lite";
import Link from "next/link";
import { useEffect } from "react";
import Clock from "./Clock";
import { useStore } from "./StoreProvider";

const Page = observer(function Page(props) {
  // use store from the store context
  const store = useStore();

  //start the clock when the component is mounted
  useEffect(() => {
    store.start();

    // stop the clock when the component unmounts
    return () => {
      store.stop();
    };
  }, [store]);

  return (
    <div>
      <h1>{props.title}</h1>
      <Clock />
      <nav>
        <Link href={props.linkTo}>Navigate</Link>
      </nav>
    </div>
  );
});

export default Page;
