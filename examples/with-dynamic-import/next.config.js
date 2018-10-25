module.exports = {
  exportPathMap() {
    return {
      "/": { page: "/", query: { showMore: false } },
      "/about": { page: "/about" }
    };
  }
};
