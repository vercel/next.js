const defaultConfig = {
  title: "kingwell",
  color:
    "#" +
    Math.random()
      .toString(16)
      .slice(2, 8),
  partnerId: null,
  partnerDomain: "",
  resDomain: "",
  imgDomain: ""
};
const siteConfig = (state = defaultConfig, action) => {
  switch (action.type) {
    case "SET_COLOR":
      state.color = action.color;
      return { ...state };
    case "SET_TITLE":
      state.title = action.title;
      return { ...state };
    default:
      return { ...state };
  }
};
export default siteConfig;
