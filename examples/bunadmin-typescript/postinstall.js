const path = require("path")
const {
  useNextJsRouter
} = require("@bunred/bunadmin/lib/utils/node/nextjs-handler")

const modulesPath = path.resolve(__dirname, "./node_modules")

useNextJsRouter(modulesPath)
