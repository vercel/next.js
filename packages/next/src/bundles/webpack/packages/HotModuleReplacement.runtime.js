/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

/** @typedef {string | number} ModuleId */
/** @typedef {Record<string, unknown>} HotData */
/** @typedef {(data: HotData) => void} DisposeHandler */
/** @typedef {(outdatedDependencies: ModuleId[]) => void} AcceptCallback */
/** @typedef {(err: Error, context: { moduleId: ModuleId, dependencyId?: ModuleId, module?: HotModule }) => void} AcceptErrorHandler */
/** @typedef {(status: string) => (Promise<void> | void)} StatusHandler */
/** @typedef {Record<string, unknown>} ApplyOptions */
/** @typedef {(reportError: (err: Error) => void) => Promise<ModuleId[]>} ApplyFn */
/** @typedef {{ (id: ModuleId): unknown, e: (chunkId: ModuleId, fetchPriority?: string) => Promise<unknown>, [name: string]: unknown }} WebpackRequire */

/**
 * @typedef {object} ApplyResult
 * @property {Error=} error fatal error that aborts the update
 * @property {(() => void)=} dispose dispose phase of the update
 * @property {ApplyFn=} apply apply phase of the update
 */

/** @typedef {(options: ApplyOptions) => ApplyResult} ApplyHandler */
/** @typedef {(moduleId: ModuleId, applyHandlers: ApplyHandler[]) => void} InvalidateModuleHandler */
/** @typedef {(chunkIds: ModuleId[], removedChunks: ModuleId[], removedModules: ModuleId[], promises: Promise<unknown>[], applyHandlers: ApplyHandler[], updatedModulesList: ModuleId[], css: ModuleId[] | undefined, forceLoadChunks: ModuleId[] | undefined) => void} DownloadUpdateHandler */

/**
 * @typedef {object} HMRManifest
 * @property {ModuleId[]} c updated chunk ids
 * @property {ModuleId[]} r removed chunk ids
 * @property {ModuleId[]} m removed module ids
 * @property {ModuleId[]=} css updated css chunk ids
 * @property {ModuleId[]=} f chunk ids to force-load
 */

/**
 * @typedef {object} HotModule
 * @property {ModuleId} id module id
 * @property {Hot} hot hot API of the module
 * @property {ModuleId[]} parents ids of modules requiring this module
 * @property {ModuleId[]} children ids of modules required by this module
 */

/**
 * @typedef {object} Hot
 * @property {Record<ModuleId, AcceptCallback>} _acceptedDependencies accept callbacks by dependency id
 * @property {Record<ModuleId, AcceptErrorHandler | undefined>} _acceptedErrorHandlers error handlers by dependency id
 * @property {Record<ModuleId, boolean>} _declinedDependencies declined dependency ids
 * @property {boolean | EXPECTED_FUNCTION} _selfAccepted true or the self-accept error handler
 * @property {boolean} _selfDeclined module declined itself
 * @property {boolean} _selfInvalidated module invalidated itself
 * @property {DisposeHandler[]} _disposeHandlers registered dispose handlers
 * @property {boolean} _main module is the entry of the update
 * @property {() => void} _requireSelf re-require the module on apply
 * @property {boolean} active module is not disposed
 * @property {(dep?: ModuleId | ModuleId[] | AcceptCallback, callback?: AcceptCallback, errorHandler?: AcceptErrorHandler) => void} accept accept updates
 * @property {(dep?: ModuleId | ModuleId[]) => void} decline decline updates
 * @property {(callback: DisposeHandler) => void} dispose add a dispose handler
 * @property {(callback: DisposeHandler) => void} addDisposeHandler add a dispose handler
 * @property {(callback: DisposeHandler) => void} removeDisposeHandler remove a dispose handler
 * @property {() => void} invalidate invalidate the module
 * @property {(applyOnUpdate?: boolean | ApplyOptions) => Promise<ModuleId[] | null>} check check for an update
 * @property {(options?: ApplyOptions) => Promise<ModuleId[]>} apply apply a checked update
 * @property {(l?: StatusHandler) => string | void} status get status or add a status handler
 * @property {(l: StatusHandler) => void} addStatusHandler add a status handler
 * @property {(l: StatusHandler) => void} removeStatusHandler remove a status handler
 * @property {HotData} data data left from the previous dispose
 */

/** @typedef {{ module: HotModule, require: WebpackRequire, id: ModuleId }} InterceptOptions */

// Globals injected by code generation; declared here only to type the template.
/* eslint-disable no-unassigned-vars */
/** @type {((options: InterceptOptions) => void)[]} */
var $interceptModuleExecution$;
/** @type {Record<ModuleId, HotModule>} */
var $moduleCache$;
/** @type {Record<ModuleId, HotData>} */
var $hmrModuleData$;
/** @type {() => Promise<HMRManifest | void>} */
var $hmrDownloadManifest$;
/** @type {Record<string, DownloadUpdateHandler>} */
var $hmrDownloadUpdateHandlers$;
/** @type {Record<string, InvalidateModuleHandler>} */
var $hmrInvalidateModuleHandlers$;
/** @type {(id: ModuleId) => unknown} */
var __webpack_require__;
/* eslint-enable no-unassigned-vars */

module.exports = function () {
	/** @type {Record<ModuleId, HotData>} */
	var currentModuleData = {};
	var installedModules = $moduleCache$;

	// module and require creation
	/** @type {ModuleId | undefined} */
	var currentChildModule;
	/** @type {ModuleId[]} */
	var currentParents = [];

	// status
	/** @type {StatusHandler[]} */
	var registeredStatusHandlers = [];
	var currentStatus = "idle";

	// while downloading
	var blockingPromises = 0;
	/** @type {(() => void)[]} */
	var blockingPromisesWaiting = [];

	// The update info
	/** @type {ApplyHandler[] | undefined} */
	var currentUpdateApplyHandlers;
	/** @type {ModuleId[] | undefined} */
	var queuedInvalidatedModules;

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

	/**
	 * @param {WebpackRequire} require the original require function
	 * @param {ModuleId} moduleId module id
	 * @returns {WebpackRequire} hot-aware require function
	 */
	function createRequire(require, moduleId) {
		var me = installedModules[moduleId];
		if (!me) return require;
		/**
		 * @param {ModuleId} request requested module id
		 * @returns {unknown} module exports
		 */
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
		/**
		 * @param {string} name property name
		 * @returns {PropertyDescriptor} descriptor forwarding to require
		 */
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
		/** @type {WebpackRequire} */ (fn).e = function (chunkId, fetchPriority) {
			return trackBlockingPromise(require.e(chunkId, fetchPriority));
		};
		return /** @type {WebpackRequire} */ (fn);
	}

	/**
	 * @param {ModuleId} moduleId module id
	 * @param {HotModule} me the module
	 * @returns {Hot} hot API
	 */
	function createModuleHotObject(moduleId, me) {
		var _main = currentChildModule !== moduleId;
		/** @type {Hot} */
		var hot = {
			// private stuff
			_acceptedDependencies: {},
			_acceptedErrorHandlers: {},
			_declinedDependencies: {},
			_selfAccepted: false,
			_selfDeclined: false,
			_selfInvalidated: false,
			_disposeHandlers: [],
			_main: _main,
			_requireSelf: function () {
				currentParents = me.parents.slice();
				currentChildModule = _main ? undefined : moduleId;
				__webpack_require__(moduleId);
			},

			// Module API
			active: true,
			accept: function (dep, callback, errorHandler) {
				if (dep === undefined) hot._selfAccepted = true;
				else if (typeof dep === "function") hot._selfAccepted = dep;
				else if (typeof dep === "object" && dep !== null) {
					for (var i = 0; i < dep.length; i++) {
						hot._acceptedDependencies[dep[i]] = callback || function () {};
						hot._acceptedErrorHandlers[dep[i]] = errorHandler;
					}
				} else {
					hot._acceptedDependencies[dep] = callback || function () {};
					hot._acceptedErrorHandlers[dep] = errorHandler;
				}
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
								/** @type {ApplyHandler[]} */ (currentUpdateApplyHandlers)
							);
						});
						setStatus("ready");
						break;
					case "ready":
						Object.keys($hmrInvalidateModuleHandlers$).forEach(function (key) {
							$hmrInvalidateModuleHandlers$[key](
								moduleId,
								/** @type {ApplyHandler[]} */ (currentUpdateApplyHandlers)
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

			// inherit from previous dispose call
			data: currentModuleData[moduleId]
		};
		currentChildModule = undefined;
		return hot;
	}

	/**
	 * @param {string} newStatus new status
	 * @returns {Promise<void>} promise resolving when all handlers ran
	 */
	function setStatus(newStatus) {
		currentStatus = newStatus;
		/** @type {(Promise<void> | void)[]} */
		var results = [];

		for (var i = 0; i < registeredStatusHandlers.length; i++)
			results[i] = registeredStatusHandlers[i].call(null, newStatus);

		return Promise.all(results).then(function () {});
	}

	function unblock() {
		if (--blockingPromises === 0) {
			setStatus("ready").then(function () {
				if (blockingPromises === 0) {
					var list = blockingPromisesWaiting;
					blockingPromisesWaiting = [];
					for (var i = 0; i < list.length; i++) {
						list[i]();
					}
				}
			});
		}
	}

	/**
	 * @param {Promise<unknown>} promise blocking promise
	 * @returns {Promise<unknown>} the same promise
	 */
	function trackBlockingPromise(promise) {
		switch (currentStatus) {
			case "ready":
				setStatus("prepare");
			/* fallthrough */
			case "prepare":
				blockingPromises++;
				promise.then(unblock, unblock);
				return promise;
			default:
				return promise;
		}
	}

	/**
	 * @param {() => Promise<ModuleId[]>} fn function to run once unblocked
	 * @returns {Promise<ModuleId[]>} result of fn
	 */
	function waitForBlockingPromises(fn) {
		if (blockingPromises === 0) return fn();
		return /** @type {Promise<ModuleId[]>} */ (
			new Promise(function (resolve) {
				blockingPromisesWaiting.push(function () {
					resolve(fn());
				});
			})
		);
	}

	/**
	 * @param {boolean | ApplyOptions=} applyOnUpdate apply the update right away
	 * @returns {Promise<ModuleId[] | null>} updated module ids or null
	 */
	function hotCheck(applyOnUpdate) {
		if (currentStatus !== "idle") {
			throw new Error("check() is only allowed in idle status");
		}
		return setStatus("check")
			.then($hmrDownloadManifest$)
			.then(function (update) {
				if (!update) {
					return setStatus(applyInvalidatedModules() ? "ready" : "idle").then(
						function () {
							return null;
						}
					);
				}

				return setStatus("prepare").then(function () {
					/** @type {ModuleId[]} */
					var updatedModules = [];
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
								/** @type {ApplyHandler[]} */ (currentUpdateApplyHandlers),
								updatedModules,
								update.css,
								update.f
							);
							return promises;
						}, /** @type {Promise<unknown>[]} */ ([]))
					).then(function () {
						return waitForBlockingPromises(function () {
							if (applyOnUpdate) {
								return internalApply(applyOnUpdate);
							}
							return setStatus("ready").then(function () {
								return updatedModules;
							});
						});
					});
				});
			});
	}

	/**
	 * @param {ApplyOptions=} options apply options
	 * @returns {Promise<ModuleId[]>} updated module ids
	 */
	function hotApply(options) {
		if (currentStatus !== "ready") {
			return Promise.resolve().then(function () {
				throw new Error(
					"apply() is only allowed in ready status (state: " +
						currentStatus +
						")"
				);
			});
		}
		return internalApply(options);
	}

	/**
	 * @param {boolean | ApplyOptions=} options apply options
	 * @returns {Promise<ModuleId[]>} updated module ids
	 */
	function internalApply(options) {
		options = options || {};

		applyInvalidatedModules();

		var results = /** @type {ApplyHandler[]} */ (
			currentUpdateApplyHandlers
		).map(function (handler) {
			return handler(/** @type {ApplyOptions} */ (options));
		});
		currentUpdateApplyHandlers = undefined;

		var errors = results
			.map(function (r) {
				return r.error;
			})
			.filter(Boolean);

		if (errors.length > 0) {
			return setStatus("abort").then(function () {
				throw errors[0];
			});
		}

		// Now in "dispose" phase
		var disposePromise = setStatus("dispose");

		results.forEach(function (result) {
			if (result.dispose) result.dispose();
		});

		// Now in "apply" phase
		var applyPromise = setStatus("apply");

		/** @type {Error | undefined} */
		var error;
		/**
		 * @param {Error} err error thrown while applying
		 * @returns {void}
		 */
		var reportError = function (err) {
			if (!error) error = err;
		};

		/** @type {ModuleId[]} */
		var outdatedModules = [];

		/**
		 * @returns {Promise<ModuleId[]>} updated module ids
		 */
		var onAccepted = function () {
			return Promise.all([disposePromise, applyPromise]).then(function () {
				// handle errors in accept handlers and self accepted module load
				if (error) {
					return setStatus("fail").then(function () {
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

				return setStatus("idle").then(function () {
					return outdatedModules;
				});
			});
		};

		return Promise.all(
			results
				.filter(function (result) {
					return result.apply;
				})
				.map(function (result) {
					return /** @type {ApplyFn} */ (result.apply)(reportError);
				})
		)
			.then(function (applyResults) {
				applyResults.forEach(function (modules) {
					if (modules) {
						for (var i = 0; i < modules.length; i++) {
							outdatedModules.push(modules[i]);
						}
					}
				});
			})
			.then(onAccepted);
	}

	/**
	 * @returns {boolean | undefined} true when invalidated modules were applied
	 */
	function applyInvalidatedModules() {
		if (queuedInvalidatedModules) {
			if (!currentUpdateApplyHandlers) currentUpdateApplyHandlers = [];
			Object.keys($hmrInvalidateModuleHandlers$).forEach(function (key) {
				/** @type {ModuleId[]} */ (queuedInvalidatedModules).forEach(
					function (moduleId) {
						$hmrInvalidateModuleHandlers$[key](
							moduleId,
							/** @type {ApplyHandler[]} */ (currentUpdateApplyHandlers)
						);
					}
				);
			});
			queuedInvalidatedModules = undefined;
			return true;
		}
	}
};
