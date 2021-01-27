/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

var $interceptModuleExecution$ = undefined;
var $moduleCache$ = undefined;
// eslint-disable-next-line no-unused-vars
var $hmrModuleData$ = undefined;
var $hmrDownloadManifest$ = undefined;
var $hmrDownloadUpdateHandlers$ = undefined;
var $hmrInvalidateModuleHandlers$ = undefined;
var __webpack_require__ = undefined;

module.exports = function () {
	var currentModuleData = {};
	var installedModules = $moduleCache$;

	// module and require creation
	var currentChildModule;
	var currentParents = [];

	// status
	var registeredStatusHandlers = [];
	var currentStatus = "idle";

	// while downloading
	var blockingPromises;

	// The update info
	var currentUpdateApplyHandlers;
	var queuedInvalidatedModules;

	// eslint-disable-next-line no-unused-vars
	$hmrModuleData$ = currentModuleData;

	$interceptModuleExecution$.push(function (options) {
		var module = options.module;
		var require = createRequire(options.require, options.id);
		module.hot = createModuleHotObject(options.id, module);
		module.parents = currentParents;
		module.children = [];
		currentParents = [];
		options.require = require;
	});

	$hmrDownloadUpdateHandlers$ = {};
	$hmrInvalidateModuleHandlers$ = {};

	function createRequire(require, moduleId) {
		var me = installedModules[moduleId];
		if (!me) return require;
		var fn = function (request) {
			if (me.hot.active) {
				if (installedModules[request]) {
					var parents = installedModules[request].parents;
					if (parents.indexOf(moduleId) === -1) {
						parents.push(moduleId);
					}
				} else {
					currentParents = [moduleId];
					currentChildModule = request;
				}
				if (me.children.indexOf(request) === -1) {
					me.children.push(request);
				}
			} else {
				console.warn(
					"[HMR] unexpected require(" +
						request +
						") from disposed module " +
						moduleId
				);
				currentParents = [];
			}
			return require(request);
		};
		var createPropertyDescriptor = function (name) {
			return {
				configurable: true,
				enumerable: true,
				get: function () {
					return require[name];
				},
				set: function (value) {
					require[name] = value;
				}
			};
		};
		for (var name in require) {
			if (Object.prototype.hasOwnProperty.call(require, name) && name !== "e") {
				Object.defineProperty(fn, name, createPropertyDescriptor(name));
			}
		}
		fn.e = function (chunkId) {
			return trackBlockingPromise(require.e(chunkId));
		};
		return fn;
	}

	function createModuleHotObject(moduleId, me) {
		var hot = {
			// private stuff
			_acceptedDependencies: {},
			_declinedDependencies: {},
			_selfAccepted: false,
			_selfDeclined: false,
			_selfInvalidated: false,
			_disposeHandlers: [],
			_main: currentChildModule !== moduleId,
			_requireSelf: function () {
				currentParents = me.parents.slice();
				currentChildModule = moduleId;
				__webpack_require__(moduleId);
			},

			// Module API
			active: true,
			accept: function (dep, callback) {
				if (dep === undefined) hot._selfAccepted = true;
				else if (typeof dep === "function") hot._selfAccepted = dep;
				else if (typeof dep === "object" && dep !== null)
					for (var i = 0; i < dep.length; i++)
						hot._acceptedDependencies[dep[i]] = callback || function () {};
				else hot._acceptedDependencies[dep] = callback || function () {};
			},
			decline: function (dep) {
				if (dep === undefined) hot._selfDeclined = true;
				else if (typeof dep === "object" && dep !== null)
					for (var i = 0; i < dep.length; i++)
						hot._declinedDependencies[dep[i]] = true;
				else hot._declinedDependencies[dep] = true;
			},
			dispose: function (callback) {
				hot._disposeHandlers.push(callback);
			},
			addDisposeHandler: function (callback) {
				hot._disposeHandlers.push(callback);
			},
			removeDisposeHandler: function (callback) {
				var idx = hot._disposeHandlers.indexOf(callback);
				if (idx >= 0) hot._disposeHandlers.splice(idx, 1);
			},
			invalidate: function () {
				this._selfInvalidated = true;
				switch (currentStatus) {
					case "idle":
						currentUpdateApplyHandlers = [];
						Object.keys($hmrInvalidateModuleHandlers$).forEach(function (key) {
							$hmrInvalidateModuleHandlers$[key](
								moduleId,
								currentUpdateApplyHandlers
							);
						});
						setStatus("ready");
						break;
					case "ready":
						Object.keys($hmrInvalidateModuleHandlers$).forEach(function (key) {
							$hmrInvalidateModuleHandlers$[key](
								moduleId,
								currentUpdateApplyHandlers
							);
						});
						break;
					case "prepare":
					case "check":
					case "dispose":
					case "apply":
						(queuedInvalidatedModules = queuedInvalidatedModules || []).push(
							moduleId
						);
						break;
					default:
						// ignore requests in error states
						break;
				}
			},

			// Management API
			check: hotCheck,
			apply: hotApply,
			status: function (l) {
				if (!l) return currentStatus;
				registeredStatusHandlers.push(l);
			},
			addStatusHandler: function (l) {
				registeredStatusHandlers.push(l);
			},
			removeStatusHandler: function (l) {
				var idx = registeredStatusHandlers.indexOf(l);
				if (idx >= 0) registeredStatusHandlers.splice(idx, 1);
			},

			//inherit from previous dispose call
			data: currentModuleData[moduleId]
		};
		currentChildModule = undefined;
		return hot;
	}

	function setStatus(newStatus) {
		currentStatus = newStatus;
		for (var i = 0; i < registeredStatusHandlers.length; i++)
			registeredStatusHandlers[i].call(null, newStatus);
	}

	function trackBlockingPromise(promise) {
		switch (currentStatus) {
			case "ready":
				setStatus("prepare");
				blockingPromises.push(promise);
				waitForBlockingPromises(function () {
					setStatus("ready");
				});
				return promise;
			case "prepare":
				blockingPromises.push(promise);
				return promise;
			default:
				return promise;
		}
	}

	function waitForBlockingPromises(fn) {
		if (blockingPromises.length === 0) return fn();
		var blocker = blockingPromises;
		blockingPromises = [];
		return Promise.all(blocker).then(function () {
			return waitForBlockingPromises(fn);
		});
	}

	function hotCheck(applyOnUpdate) {
		if (currentStatus !== "idle") {
			throw new Error("check() is only allowed in idle status");
		}
		setStatus("check");
		return $hmrDownloadManifest$().then(function (update) {
			if (!update) {
				setStatus(applyInvalidatedModules() ? "ready" : "idle");
				return null;
			}

			setStatus("prepare");

			var updatedModules = [];
			blockingPromises = [];
			currentUpdateApplyHandlers = [];

			return Promise.all(
				Object.keys($hmrDownloadUpdateHandlers$).reduce(function (
					promises,
					key
				) {
					$hmrDownloadUpdateHandlers$[key](
						update.c,
						update.r,
						update.m,
						promises,
						currentUpdateApplyHandlers,
						updatedModules
					);
					return promises;
				},
				[])
			).then(function () {
				return waitForBlockingPromises(function () {
					if (applyOnUpdate) {
						return internalApply(applyOnUpdate);
					} else {
						setStatus("ready");

						return updatedModules;
					}
				});
			});
		});
	}

	function hotApply(options) {
		if (currentStatus !== "ready") {
			return Promise.resolve().then(function () {
				throw new Error("apply() is only allowed in ready status");
			});
		}
		return internalApply(options);
	}

	function internalApply(options) {
		options = options || {};

		applyInvalidatedModules();

		var results = currentUpdateApplyHandlers.map(function (handler) {
			return handler(options);
		});
		currentUpdateApplyHandlers = undefined;

		var errors = results
			.map(function (r) {
				return r.error;
			})
			.filter(Boolean);

		if (errors.length > 0) {
			setStatus("abort");
			return Promise.resolve().then(function () {
				throw errors[0];
			});
		}

		// Now in "dispose" phase
		setStatus("dispose");

		results.forEach(function (result) {
			if (result.dispose) result.dispose();
		});

		// Now in "apply" phase
		setStatus("apply");

		var error;
		var reportError = function (err) {
			if (!error) error = err;
		};

		var outdatedModules = [];
		results.forEach(function (result) {
			if (result.apply) {
				var modules = result.apply(reportError);
				if (modules) {
					for (var i = 0; i < modules.length; i++) {
						outdatedModules.push(modules[i]);
					}
				}
			}
		});

		// handle errors in accept handlers and self accepted module load
		if (error) {
			setStatus("fail");
			return Promise.resolve().then(function () {
				throw error;
			});
		}

		if (queuedInvalidatedModules) {
			return internalApply(options).then(function (list) {
				outdatedModules.forEach(function (moduleId) {
					if (list.indexOf(moduleId) < 0) list.push(moduleId);
				});
				return list;
			});
		}

		setStatus("idle");
		return Promise.resolve(outdatedModules);
	}

	function applyInvalidatedModules() {
		if (queuedInvalidatedModules) {
			if (!currentUpdateApplyHandlers) currentUpdateApplyHandlers = [];
			Object.keys($hmrInvalidateModuleHandlers$).forEach(function (key) {
				queuedInvalidatedModules.forEach(function (moduleId) {
					$hmrInvalidateModuleHandlers$[key](
						moduleId,
						currentUpdateApplyHandlers
					);
				});
			});
			queuedInvalidatedModules = undefined;
			return true;
		}
	}
};
