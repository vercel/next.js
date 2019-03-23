import { createContext, useContext, useReducer, useEffect } from "react";
import Head from "next/head";
import withSiteTitle, { TitleContext } from "./withSiteTitle";

export const DocTitleContext = createContext();

function resetTitle() {
  return new Promise(resolve => {
    setTimeout(resolve, 1000);
  });
}

const reducer = (state = "", action) => {
  switch (action.type) {
    case "CHANGE_TITLE":
      return action.title;
    case "RESET":
      return "";
    default:
      throw new Error("Unexpected action");
  }
};

const WithDocumentTitle = Component =>
  withSiteTitle(function WithDocumentTitleComponent(props) {
    const title = useContext(TitleContext);
    const [state, dispatch] = useReducer(reducer, title);
    useEffect(() => {
      if (state !== title) {
        resetTitle().then(() => {
          dispatch({
            type: "CHANGE_TITLE",
            title
          });
        });
      }
    }, [state]);
    return (
      <DocTitleContext.Provider value={{ state, dispatch }}>
        <Head>
          <title>{state}</title>
        </Head>
        <Component {...props} />
      </DocTitleContext.Provider>
    );
  });

export default WithDocumentTitle;
