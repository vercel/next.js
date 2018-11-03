module.exports = app => {
  const { router, controller } = app

  router.get('/index', controller.pages.index)
  router.get('/demo', controller.pages.demo)
}
