import React from 'react'

// Service Worker snippets from https://github.com/codebusking/vue-hn-pwa-guide-kit/tree/master/build
// all of comments was removed to convenience reason

const swDevRegistration =
`self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', () => {
	self.clients.matchAll({ type: 'window' }).then(windowClients => {
		for (let windowClient of windowClients) {
			windowClient.navigate(windowClient.url)
		}
	})
})`

const swProdRegistration =
`(function() {
	'use strict'
	const isLocalhost = Boolean(window.location.hostname === 'localhost' ||
			window.location.hostname === '[::1]' ||
			window.location.hostname.match(
				/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/
			)
		)

	window.addEventListener('load', function() {
		if ('serviceWorker' in navigator &&
				(window.location.protocol === 'https:' || isLocalhost)) {

			navigator.serviceWorker.register('service-worker.js').then(function(registration) {
				console.log('ServiceWorker registration successful with scope: ', registration.scope);
			}).catch(function(e) {
				console.error('Error during service worker registration:', e)
			})

			navigator.serviceWorker.addEventListener('message', async event => {
				console.log('Lets Get started with workbox', event)
			})

		}
	})
})()`

export default () => (
	<script dangerouslySetInnerHTML={{
		__html: process.env.NODE_ENV === 'production'
			? swProdRegistration
			: swDevRegistration
	}} />
)