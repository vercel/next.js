import { createContext, useEffect, useState } from "react";

export const TitleContext = createContext({});

const WithSiteTitle = Component =>
  function WithTitleData(props) {
    const [title, setTitle] = useState(null);

    useEffect(() => {
      // perform fetch site title from data sources
      setTitle("My Application");
    }, []);

    if (!title) return null;

    return (
      <TitleContext.Provider value={title}>
        <Component {...props} />
      </TitleContext.Provider>
    );
  };

export default WithSiteTitle;
