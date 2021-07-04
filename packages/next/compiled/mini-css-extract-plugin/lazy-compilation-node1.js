/* global __resourceQuery */

"use strict";

var urlBase = decodeURIComponent(__resourceQuery.slice(1));
exports.keepAlive = function (options) {
	var data = options.data;
	var onError = options.onError;
	var active = options.active;
	var module = options.module;
	var response;
	var request = require("http").request(
		urlBase + data,
		{
			agent: false,
			headers: { accept: "text/event-stream" }
		},
		function (res) {
			response = res;
			response.on("error", errorHandler);
			if (!active && !module.hot) {
				console.log(
					"Hot Module Replacement is not enabled. Waiting for process restart..."
				);
			}
		}
	);
	function errorHandler(err) {
		err.message =
			"Problem communicating active modules to the server: " + err.message;
		onError(err);
	}
	request.on("error", errorHandler);
	request.end();
	return function () {
		response.destroy();
	};
};
