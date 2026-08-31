/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

/** @typedef {string | number} ModuleId */
/** @typedef {Record<string, unknown>} HotData */
/** @typedef {(data: HotData) => void} DisposeHandler */
/** @typedef {(outdatedDependencies: ModuleId[]) => void} AcceptCallback */
/** @typedef {(err: unknown, context: { moduleId: ModuleId, dependencyId: ModuleId }) => void} AcceptErrorHandler */
/** @typedef {{ type: string, moduleId: ModuleId, dependencyId?: ModuleId, error: unknown, originalError?: unknown }} HotErrorEvent */
/** @typedef {(reportError: (err: unknown) => void) => Promise<ModuleId[]>} ApplyFn */

/**
 * @typedef {object} ApplyOptions
 * @property {boolean=} ignoreUnaccepted ignore unaccepted modules
 * @property {boolean=} ignoreDeclined ignore declined modules
 * @property {boolean=} ignoreErrored ignore errors thrown while applying
 * @property {((event: ModuleEffect) => void)=} onDeclined called for declined modules
 * @property {((event: ModuleEffect) => void)=} onUnaccepted called for unaccepted modules
 * @property {((event: ModuleEffect) => void)=} onAccepted called for accepted modules
 * @property {((event: ModuleEffect) => void)=} onDisposed called for disposed modules
 * @property {((event: HotErrorEvent) => void)=} onErrored called on apply errors
 */

/**
 * @typedef {object} ApplyResult
 * @property {Error=} error fatal error that aborts the update
 * @property {(() => void)=} dispose dispose phase of the update
 * @property {ApplyFn=} apply apply phase of the update
 */

/** @typedef {(options: ApplyOptions) => ApplyResult} ApplyHandler */
/** @typedef {(moduleId: ModuleId, applyHandlers: ApplyHandler[]) => void} InvalidateModuleHandler */
/** @typedef {(chunkIds: ModuleId[], removedChunks: ModuleId[], removedModules: ModuleId[], promises: Promise<unknown>[], applyHandlers: ApplyHandler[], updatedModulesList: ModuleId[], css: ModuleId[] | undefined, forceLoadChunks: ModuleId[] | undefined) => void} DownloadUpdateHandler */
/** @typedef {(chunkId: ModuleId, promises: Promise<unknown>[]) => void} EnsureChunkHandler */
/** @typedef {(webpackRequire: (id: ModuleId) => unknown) => void} RuntimeModuleFn */

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
 */

/**
 * @typedef {object} HotModule
 * @property {ModuleId} id module id
 * @property {Hot} hot hot API of the module
 * @property {ModuleId[]} parents ids of modules requiring this module
 * @property {ModuleId[]} children ids of modules required by this module
 */

/**
 * @typedef {object} ModuleEffect
 * @property {string} type effect type
 * @property {ModuleId} moduleId affected module id
 * @property {ModuleId[]=} chain update propagation chain
 * @property {ModuleId=} parentId declining parent id
 * @property {ModuleId[]=} outdatedModules outdated module ids
 * @property {Record<ModuleId, ModuleId[]>=} outdatedDependencies outdated dependencies by module id
 */

/** @typedef {{ chain: ModuleId[], id: ModuleId }} QueueItem */
/** @typedef {{ module: ModuleId, require: (id?: ModuleId) => void, errorHandler: boolean | EXPECTED_FUNCTION }} SelfAcceptedModule */

// Globals injected by code generation; declared here only to type the template.
/* eslint-disable no-unassigned-vars */
/** @type {Record<ModuleId, unknown>} */
var $installedChunks$;
/** @type {(chunkId: ModuleId, updatedModulesList?: ModuleId[]) => Promise<unknown>} */
var $loadUpdateChunk$;
/** @type {Record<ModuleId, HotModule>} */
var $moduleCache$;
/** @type {Record<ModuleId, EXPECTED_FUNCTION>} */
var $moduleFactories$;
/** @type {Record<string, EnsureChunkHandler>} */
var $ensureChunkHandlers$;
/** @type {(obj: object, key: ModuleId) => boolean} */
var $hasOwnProperty$;
/** @type {Record<ModuleId, HotData>} */
var $hmrModuleData$;
/** @type {Record<string, DownloadUpdateHandler>} */
var $hmrDownloadUpdateHandlers$;
/** @type {Record<string, InvalidateModuleHandler>} */
var $hmrInvalidateModuleHandlers$;
/** @type {(id: ModuleId) => unknown} */
var __webpack_require__;
/* eslint-enable no-unassigned-vars */

module.exports = function () {
	/** @type {Record<ModuleId, boolean>} */
	var currentUpdateChunks;
	/** @type {Record<ModuleId, EXPECTED_FUNCTION | false>} */
	var currentUpdate;
	/** @type {ModuleId[]} */
	var currentUpdateRemovedChunks;
	/** @type {RuntimeModuleFn[]} */
	var currentUpdateRuntime;
	/**
	 * @param {ApplyOptions} options apply options
	 * @returns {ApplyResult} dispose/apply handlers or a fatal error
	 */
	function applyHandler(options) {
		if ($ensureChunkHandlers$) delete $ensureChunkHandlers$.$key$Hmr;
		currentUpdateChunks = /** @type {Record<ModuleId, boolean>} */ (
			/** @type {unknown} */ (undefined)
		);
		/**
		 * @param {ModuleId} updateModuleId updated module id
		 * @returns {ModuleEffect} effect of updating the module
		 */
		function getAffectedModuleEffects(updateModuleId) {
			/** @type {ModuleId[]} */
			var outdatedModules = [updateModuleId];
			/** @type {Record<ModuleId, ModuleId[]>} */
			var outdatedDependencies = {};

			/** @type {QueueItem[]} */
			var queue = outdatedModules.map(function (id) {
				return {
					chain: [id],
					id: id
				};
			});
			while (queue.length > 0) {
				var queueItem = /** @type {QueueItem} */ (queue.pop());
				var moduleId = queueItem.id;
				var chain = queueItem.chain;
				var module = $moduleCache$[moduleId];
				if (
					!module ||
					(module.hot._selfAccepted && !module.hot._selfInvalidated)
				)
					continue;
				if (module.hot._selfDeclined) {
					return {
						type: "self-declined",
						chain: chain,
						moduleId: moduleId
					};
				}
				if (module.hot._main) {
					return {
						type: "unaccepted",
						chain: chain,
						moduleId: moduleId
					};
				}
				for (var i = 0; i < module.parents.length; i++) {
					var parentId = module.parents[i];
					var parent = $moduleCache$[parentId];
					if (!parent) continue;
					if (parent.hot._declinedDependencies[moduleId]) {
						return {
							type: "declined",
							chain: chain.concat([parentId]),
							moduleId: moduleId,
							parentId: parentId
						};
					}
					if (outdatedModules.indexOf(parentId) !== -1) continue;
					if (parent.hot._acceptedDependencies[moduleId]) {
						if (!outdatedDependencies[parentId])
							outdatedDependencies[parentId] = [];
						addAllToSet(outdatedDependencies[parentId], [moduleId]);
						continue;
					}
					delete outdatedDependencies[parentId];
					outdatedModules.push(parentId);
					queue.push({
						chain: chain.concat([parentId]),
						id: parentId
					});
				}
			}

			return {
				type: "accepted",
				moduleId: updateModuleId,
				outdatedModules: outdatedModules,
				outdatedDependencies: outdatedDependencies
			};
		}

		/**
		 * @param {ModuleId[]} a target set
		 * @param {ModuleId[]} b items to add
		 * @returns {void}
		 */
		function addAllToSet(a, b) {
			for (var i = 0; i < b.length; i++) {
				var item = b[i];
				if (a.indexOf(item) === -1) a.push(item);
			}
		}

		// at begin all updates modules are outdated
		// the "outdated" status can propagate to parents if they don't accept the children
		/** @type {Record<ModuleId, ModuleId[]>} */
		var outdatedDependencies = {};
		/** @type {ModuleId[]} */
		var outdatedModules = [];
		/** @type {Record<ModuleId, EXPECTED_FUNCTION>} */
		var appliedUpdate = {};

		/**
		 * @param {HotModule} module disposed module
		 * @returns {void}
		 */
		var warnUnexpectedRequire = function warnUnexpectedRequire(module) {
			console.warn(
				"[HMR] unexpected require(" + module.id + ") to disposed module"
			);
		};

		for (var moduleId in currentUpdate) {
			if ($hasOwnProperty$(currentUpdate, moduleId)) {
				var newModuleFactory = currentUpdate[moduleId];
				/** @type {ModuleEffect} */
				var result = newModuleFactory
					? getAffectedModuleEffects(moduleId)
					: {
							type: "disposed",
							moduleId: moduleId
						};
				/** @type {Error|false} */
				var abortError = false;
				var doApply = false;
				var doDispose = false;
				var chainInfo = "";
				if (result.chain) {
					chainInfo = "\nUpdate propagation: " + result.chain.join(" -> ");
				}
				switch (result.type) {
					case "self-declined":
						if (options.onDeclined) options.onDeclined(result);
						if (!options.ignoreDeclined)
							abortError = new Error(
								"Aborted because of self decline: " +
									result.moduleId +
									chainInfo
							);
						break;
					case "declined":
						if (options.onDeclined) options.onDeclined(result);
						if (!options.ignoreDeclined)
							abortError = new Error(
								"Aborted because of declined dependency: " +
									result.moduleId +
									" in " +
									result.parentId +
									chainInfo
							);
						break;
					case "unaccepted":
						if (options.onUnaccepted) options.onUnaccepted(result);
						if (!options.ignoreUnaccepted)
							abortError = new Error(
								"Aborted because " + moduleId + " is not accepted" + chainInfo
							);
						break;
					case "accepted":
						if (options.onAccepted) options.onAccepted(result);
						doApply = true;
						break;
					case "disposed":
						if (options.onDisposed) options.onDisposed(result);
						doDispose = true;
						break;
					default:
						throw new Error("Unexception type " + result.type);
				}
				if (abortError) {
					return {
						error: abortError
					};
				}
				if (doApply) {
					appliedUpdate[moduleId] = /** @type {EXPECTED_FUNCTION} */ (
						newModuleFactory
					);
					addAllToSet(
						outdatedModules,
						/** @type {ModuleId[]} */ (result.outdatedModules)
					);
					var resultOutdatedDependencies =
						/** @type {Record<ModuleId, ModuleId[]>} */ (
							result.outdatedDependencies
						);
					for (moduleId in resultOutdatedDependencies) {
						if ($hasOwnProperty$(resultOutdatedDependencies, moduleId)) {
							if (!outdatedDependencies[moduleId])
								outdatedDependencies[moduleId] = [];
							addAllToSet(
								outdatedDependencies[moduleId],
								resultOutdatedDependencies[moduleId]
							);
						}
					}
				}
				if (doDispose) {
					addAllToSet(outdatedModules, [result.moduleId]);
					appliedUpdate[moduleId] = warnUnexpectedRequire;
				}
			}
		}
		currentUpdate = /** @type {Record<ModuleId, EXPECTED_FUNCTION | false>} */ (
			/** @type {unknown} */ (undefined)
		);

		// Store self accepted outdated modules to require them later by the module system
		/** @type {SelfAcceptedModule[]} */
		var outdatedSelfAcceptedModules = [];
		for (var j = 0; j < outdatedModules.length; j++) {
			var outdatedModuleId = outdatedModules[j];
			var module = $moduleCache$[outdatedModuleId];
			if (
				module &&
				(module.hot._selfAccepted || module.hot._main) &&
				// removed self-accepted modules should not be required
				appliedUpdate[outdatedModuleId] !== warnUnexpectedRequire &&
				// when called invalidate self-accepting is not possible
				!module.hot._selfInvalidated
			) {
				outdatedSelfAcceptedModules.push({
					module: outdatedModuleId,
					require: module.hot._requireSelf,
					errorHandler: module.hot._selfAccepted
				});
			}
		}

		/** @type {ModuleId[]} */
		var moduleOutdatedDependencies;

		return {
			dispose: function () {
				currentUpdateRemovedChunks.forEach(function (chunkId) {
					delete $installedChunks$[chunkId];
				});
				currentUpdateRemovedChunks = /** @type {ModuleId[]} */ (
					/** @type {unknown} */ (undefined)
				);

				var idx;
				var queue = outdatedModules.slice();
				while (queue.length > 0) {
					var moduleId = /** @type {ModuleId} */ (queue.pop());
					var module = $moduleCache$[moduleId];
					if (!module) continue;

					/** @type {HotData} */
					var data = {};

					// Call dispose handlers
					var disposeHandlers = module.hot._disposeHandlers;
					for (j = 0; j < disposeHandlers.length; j++) {
						disposeHandlers[j].call(null, data);
					}
					$hmrModuleData$[moduleId] = data;

					// disable module (this disables requires from this module)
					module.hot.active = false;

					// remove module from cache
					delete $moduleCache$[moduleId];

					// when disposing there is no need to call dispose handler
					delete outdatedDependencies[moduleId];

					// remove "parents" references from all children
					for (j = 0; j < module.children.length; j++) {
						var child = $moduleCache$[module.children[j]];
						if (!child) continue;
						idx = child.parents.indexOf(moduleId);
						if (idx >= 0) {
							child.parents.splice(idx, 1);
						}
					}
				}

				// remove outdated dependency from module children
				var dependency;
				for (var outdatedModuleId in outdatedDependencies) {
					if ($hasOwnProperty$(outdatedDependencies, outdatedModuleId)) {
						module = $moduleCache$[outdatedModuleId];
						if (module) {
							moduleOutdatedDependencies =
								outdatedDependencies[outdatedModuleId];
							for (j = 0; j < moduleOutdatedDependencies.length; j++) {
								dependency = moduleOutdatedDependencies[j];
								idx = module.children.indexOf(dependency);
								if (idx >= 0) module.children.splice(idx, 1);
							}
						}
					}
				}
			},
			apply: function (reportError) {
				/** @type {Promise<unknown>[]} */
				var acceptPromises = [];
				// insert new code
				for (var updateModuleId in appliedUpdate) {
					if ($hasOwnProperty$(appliedUpdate, updateModuleId)) {
						$moduleFactories$[updateModuleId] = appliedUpdate[updateModuleId];
					}
				}

				// run new runtime modules
				for (var i = 0; i < currentUpdateRuntime.length; i++) {
					currentUpdateRuntime[i](__webpack_require__);
				}

				// call accept handlers
				for (var outdatedModuleId in outdatedDependencies) {
					if ($hasOwnProperty$(outdatedDependencies, outdatedModuleId)) {
						var module = $moduleCache$[outdatedModuleId];
						if (module) {
							moduleOutdatedDependencies =
								outdatedDependencies[outdatedModuleId];
							/** @type {AcceptCallback[]} */
							var callbacks = [];
							/** @type {(AcceptErrorHandler | undefined)[]} */
							var errorHandlers = [];
							/** @type {ModuleId[]} */
							var dependenciesForCallbacks = [];
							for (var j = 0; j < moduleOutdatedDependencies.length; j++) {
								var dependency = moduleOutdatedDependencies[j];
								var acceptCallback =
									module.hot._acceptedDependencies[dependency];
								var errorHandler =
									module.hot._acceptedErrorHandlers[dependency];
								if (acceptCallback) {
									if (callbacks.indexOf(acceptCallback) !== -1) continue;
									callbacks.push(acceptCallback);
									errorHandlers.push(errorHandler);
									dependenciesForCallbacks.push(dependency);
								}
							}
							for (var k = 0; k < callbacks.length; k++) {
								/** @type {unknown} */
								var result;
								try {
									result = callbacks[k].call(null, moduleOutdatedDependencies);
								} catch (err) {
									if (typeof errorHandlers[k] === "function") {
										try {
											/** @type {AcceptErrorHandler} */
											(errorHandlers[k])(err, {
												moduleId: outdatedModuleId,
												dependencyId: dependenciesForCallbacks[k]
											});
										} catch (err2) {
											if (options.onErrored) {
												options.onErrored({
													type: "accept-error-handler-errored",
													moduleId: outdatedModuleId,
													dependencyId: dependenciesForCallbacks[k],
													error: err2,
													originalError: err
												});
											}
											if (!options.ignoreErrored) {
												reportError(err2);
												reportError(err);
											}
										}
									} else {
										if (options.onErrored) {
											options.onErrored({
												type: "accept-errored",
												moduleId: outdatedModuleId,
												dependencyId: dependenciesForCallbacks[k],
												error: err
											});
										}
										if (!options.ignoreErrored) {
											reportError(err);
										}
									}
								}
								if (
									result &&
									typeof (/** @type {{ then?: unknown }} */ (result).then) ===
										"function"
								) {
									acceptPromises.push(/** @type {Promise<unknown>} */ (result));
								}
							}
						}
					}
				}

				var onAccepted = function () {
					// Load self accepted modules
					for (var o = 0; o < outdatedSelfAcceptedModules.length; o++) {
						var item = outdatedSelfAcceptedModules[o];
						var moduleId = item.module;
						try {
							item.require(moduleId);
						} catch (err) {
							if (typeof item.errorHandler === "function") {
								try {
									item.errorHandler(err, {
										moduleId: moduleId,
										module: $moduleCache$[moduleId]
									});
								} catch (err1) {
									if (options.onErrored) {
										options.onErrored({
											type: "self-accept-error-handler-errored",
											moduleId: moduleId,
											error: err1,
											originalError: err
										});
									}
									if (!options.ignoreErrored) {
										reportError(err1);
										reportError(err);
									}
								}
							} else {
								if (options.onErrored) {
									options.onErrored({
										type: "self-accept-errored",
										moduleId: moduleId,
										error: err
									});
								}
								if (!options.ignoreErrored) {
									reportError(err);
								}
							}
						}
					}
				};

				return Promise.all(acceptPromises)
					.then(onAccepted)
					.then(function () {
						return outdatedModules;
					});
			}
		};
	}
	$hmrInvalidateModuleHandlers$.$key$ = function (moduleId, applyHandlers) {
		if (!currentUpdate) {
			currentUpdate = {};
			currentUpdateRuntime = [];
			currentUpdateRemovedChunks = [];
			applyHandlers.push(applyHandler);
		}
		if (!$hasOwnProperty$(currentUpdate, moduleId)) {
			currentUpdate[moduleId] = $moduleFactories$[moduleId];
		}
	};
	$hmrDownloadUpdateHandlers$.$key$ = function (
		chunkIds,
		removedChunks,
		removedModules,
		promises,
		applyHandlers,
		updatedModulesList,
		css,
		forceLoadChunks
	) {
		applyHandlers.push(applyHandler);
		currentUpdateChunks = {};
		currentUpdateRemovedChunks = removedChunks;
		currentUpdate = removedModules.reduce(function (obj, key) {
			obj[key] = false;
			return obj;
		}, /** @type {Record<ModuleId, EXPECTED_FUNCTION | false>} */ ({}));
		currentUpdateRuntime = [];
		chunkIds.forEach(function (chunkId) {
			if (
				$hasOwnProperty$($installedChunks$, chunkId) &&
				$installedChunks$[chunkId] !== undefined
			) {
				promises.push($loadUpdateChunk$(chunkId, updatedModulesList));
				currentUpdateChunks[chunkId] = true;
			} else {
				currentUpdateChunks[chunkId] = false;
			}
		});
		if ($ensureChunkHandlers$) {
			$ensureChunkHandlers$.$key$Hmr = function (chunkId, promises) {
				if (
					currentUpdateChunks &&
					$hasOwnProperty$(currentUpdateChunks, chunkId) &&
					!currentUpdateChunks[chunkId]
				) {
					promises.push($loadUpdateChunk$(chunkId));
					currentUpdateChunks[chunkId] = true;
				}
			};
			// Force-load chunks that now own modules orphaned by a removed chunk;
			// ensure handlers skip already-installed chunks, so no guard is needed.
			if (forceLoadChunks) {
				forceLoadChunks.forEach(function (chunkId) {
					Object.keys($ensureChunkHandlers$).forEach(function (key) {
						$ensureChunkHandlers$[key](chunkId, promises);
					});
				});
			}
		}
	};
};
