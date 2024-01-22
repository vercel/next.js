import { useState } from "react";
import Header from "../components/Header";
import dynamic from "next/dynamic";

const DynamicComponent1 = dynamic(() => import("../components/hello1"));

const DynamicComponent2WithCustomLoading = dynamic(
  () => import("../components/hello2"),
  { loading: () => <p>Loading caused by client page transition ...</p> },
);

const DynamicComponent3WithNoSSR = dynamic(
  () => import("../components/hello3"),
  { loading: () => <p>Loading ...</p>, ssr: false },
);

const DynamicComponent4 = dynamic(() => import("../components/hello4"));

const DynamicComponent5 = dynamic(() => import("../components/hello5"));

const names = ["Tim", "Joe", "Bel", "Max", "Lee"];

const IndexPage = () => {
  const [showMore, setShowMore] = useState(false);
  const [falsyField] = useState(false);
  const [results, setResults] = useState();

  return (
    <div>
      <Header />

      {/* Load immediately, but in a separate bundle */}
      <DynamicComponent1 />

      {/* Show a progress indicator while loading */}
      <DynamicComponent2WithCustomLoading />

      {/* Load only on the client side */}
      <DynamicComponent3WithNoSSR />

      {/* This component will never be loaded */}
      {falsyField && <DynamicComponent4 />}

      {/* Load on demand */}
      {showMore && <DynamicComponent5 />}
      <button onClick={() => setShowMore(!showMore)}>Toggle Show More</button>

      {/* Load library on demand */}
      <div style={{ marginTop: "1rem" }}>
        <input
          type="text"
          placeholder="Search"
          onChange={async (e) => {
            const { value } = e.currentTarget;
            // Dynamically load fuse.js
            const Fuse = (await import("fuse.js")).default;
            const fuse = new Fuse(names);

            setResults(fuse.search(value));
          }}
        />
        <pre>Results: {JSON.stringify(results, null, 2)}</pre>
      </div>
    </div>
  );
};

export default IndexPage;
