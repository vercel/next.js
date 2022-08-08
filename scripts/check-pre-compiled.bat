copy node_modules\webpack5\lib\hmr\HotModuleReplacement.runtime.js packages\next\bundles\webpack\packages\
copy node_modules\webpack5\lib\hmr\JavascriptHotModuleReplacement.runtime.js packages\next\bundles\webpack\packages\
copy node_modules\webpack5\hot\lazy-compilation-node.js packages\next\bundles\webpack\packages\
copy node_modules\webpack5\hot\lazy-compilation-web.js packages\next\bundles\webpack\packages\
yarn --cwd packages/next ncc-compiled

rem Make sure to exit with 1 if there are changes after running ncc-compiled
rem step to ensure we get any changes committed
