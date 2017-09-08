const fs = require('fs')
const path = require('path')
const globby = require('globby')
const loadJsonFile = require('load-json-file');

const dotNext = path.resolve(__dirname, './.next')
const target = path.resolve(__dirname, './.next/service-worker.js')

function bundles(app) {
	return new Promise((resolve, reject) => {
		fs.readdir(`${dotNext}/bundles/pages`, (err, files) => {
			if (err) {
				resolve(app)
			}

			if (files) {
				const root = `/_next/${app.buildId}/page`
				app.precaches = app.precaches.concat(files
					.filter(file => file !== 'index.js')
					.map(file => {
						// req /_next/22321e97-8895-48db-b915-82e255f3faa8/new
						return path.join(root, file.replace(/.js$/, ''))
					})
				)
			}

			resolve(app)
		})
	})
}

function chunks(app) {
	return new Promise((resolve, reject) => {
		fs.readdir(`${dotNext}/chunks`, (err, files) => {
			if (err) {
				resolve(app)
			}

			if (files) {
				const root = `/_next/webpack/chunks`
				app.precaches = app.precaches.concat(files
					.filter(file => /\.js$/.test(file))
					.map(file => {
						// req /_next/webpack/chunks/22321e97-8895-48db-b915-82e255f3faa8.js
						return path.join(root, file)
					})
				)
			}

			resolve(app)
		})
	})
}

function app() {
	const app = {
		buildId: fs.readFileSync(`${dotNext}/BUILD_ID`, 'utf8'),
		precaches: []
	}

	return loadJsonFile(`${dotNext}/build-stats.json`).then(stats => {
		Object.keys(stats).map(src => {
			// /_next/9265fa769281943ee96625770433e573/app.js
			app.precaches.push(`/_next/${stats[src].hash}/${src}`)
		})

		return app
	})
}

const swSnippet = (precache) =>
`importScripts('https://unpkg.com/workbox-sw@0.0.2')

const workboxSW = new WorkboxSW({clientsClaim: true})

// set precahe listed item
workboxSW.precache(${precache})

// cache very first page by sw
workboxSW.router.registerRoute(
	'/',
	workboxSW.strategies.staleWhileRevalidate()
)

// the hnpwa contributors pics
workboxSW.router.registerRoute(
  'https://github.com/(.*).png',
  workboxSW.strategies.cacheFirst({
    cacheName: 'hn-contributors',
    cacheExpiration: {
      maxEntries: 20,
      maxAgeSeconds: 7 * 24 * 60 * 60,
    },
    cacheableResponse: {statuses: [0, 200]},
  })
)

// caching movies from api
/**
 * Set up a route that will match any URL requested that starts with
 * https://api.tvmaze.com/search/shows?q=batman.
 * Handle those requests using a network-first strategy, but with a timeout.
 * If there's no network response before the timeout (2), then return the previous
 * response from the cache instead.
 */

 
workboxSW.router.registerRoute(
  'https://api.tvmaze.com/search/shows?q=batman',
  workboxSW.strategies.networkFirst({networkTimeoutSeconds: 2})
);

`

app()
	.then(chunks)
	.then(bundles)
	.then(app => {
		fs.writeFileSync(target,
			swSnippet(JSON.stringify(app.precaches, null, 2)),
			'utf8'
		)
	})
