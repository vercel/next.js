module.exports = {
  url: function () {
    return this.api.launchUrl + "/";
  },

  elements: {
    aboutLink: {
      selector: "[class^=Home_card]",
    },
  },
};
