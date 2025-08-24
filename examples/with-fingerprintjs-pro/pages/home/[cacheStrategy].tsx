import Toggler from "../../components/Toggler";
import VisitorDataPresenter from "../../components/VisitorDataPresenter";
import { useContext } from "react";
import {
  FpjsContext,
  useVisitorData,
} from "@fingerprintjs/fingerprintjs-pro-react";

function VisitorDataComponent() {
  const { data, isLoading, error } = useVisitorData({ extendedResult: true });

  return (
    <VisitorDataPresenter data={data} isLoading={isLoading} error={error} />
  );
}

function HomePage() {
  const { clearCache } = useContext(FpjsContext);

  return (
    <section className="body">
      <h3>Home page</h3>
      <div>
        On this page we use the <code>useVisitorData</code> hook with default
        settings and identification is performed as soon as the page loads. This
        is the most common use-case.
      </div>
      <Toggler>
        <VisitorDataComponent />
      </Toggler>
      <button className="clear-cache-button" onClick={() => clearCache()}>
        Clear cache
      </button>
    </section>
  );
}

export default HomePage;
