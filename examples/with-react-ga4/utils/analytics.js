import ReactGA from "react-ga4";

export const initGA = () => {
  console.log("GA init");
  ReactGA.initialize("your GA measurement id");
};

export const logPageView = () => {
  console.log(`Logging pageview for ${window.location.pathname}`);
  ReactGA.set({ page: window.location.pathname });
  ReactGA.send({ hitType: "pageview", page: window.location.pathname });
};

export const logEvent = (category = "", action = "") => {
  if (category && action) {
    ReactGA.event({ category, action });
  }
};

export const logException = (description = "", fatal = false) => {
  if (description) {
    ReactGA.gtag("event", "exception", {
      description,
      fatal, // set to true if the error is fatal
    });
  }
};
