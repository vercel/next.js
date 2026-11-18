use std::{
    fmt::Display,
    sync::{Arc, LazyLock},
};

use anyhow::{Result, bail};
use bincode::{
    Decode, Encode,
    de::Decoder,
    enc::Encoder,
    error::{DecodeError, EncodeError},
    impl_borrow_decode,
};
use rustc_hash::{FxHashMap, FxHashSet};
use serde::Serialize;
use turbo_frozenmap::{FrozenMap, FrozenSet};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexMap, FxIndexSet, NonLocalValue, OperationValue, ReadRef, ResolvedVc, State,
    TransientInstance, TryJoinIterExt, Vc,
    debug::ValueDebugFormat,
    message_queue::{CompilationEvent, Severity},
    turbo_tasks,
};
use turbopack_core::{
    chunk::ModuleId,
    version::{Version, VersionedContent},
};
use turbopack_ecmascript::{
    chunk_list::merged_update::{
        EcmascriptMergedChunkPartial, EcmascriptMergedChunkUpdate, EcmascriptMergedUpdate,
        EcmascriptModuleEntry,
    },
    hmr::{EcmascriptHmrChunkContent, version::EcmascriptChunkVersion},
};
use turbopack_nodejs::ecmascript::node::entry::chunk_list_content::EcmascriptBuildNodeChunkListContent;

#[derive(Clone, PartialEq, Eq, ValueDebugFormat, NonLocalValue)]
pub struct ServerHmrChunkList {
    pub relative_path: RcStr,
    pub versioned_content: ResolvedVc<EcmascriptBuildNodeChunkListContent>,
}

#[turbo_tasks::value(transparent, serialization = "skip")]
#[derive(Clone)]
pub struct ServerHmrChunkLists(Vec<ServerHmrChunkList>);

impl ServerHmrChunkLists {
    pub fn new(chunk_lists: Vec<ServerHmrChunkList>) -> Self {
        Self(chunk_lists)
    }

    pub fn as_slice(&self) -> &[ServerHmrChunkList] {
        &self.0
    }

    pub fn retain_entry_paths(&mut self, entry_paths: &FxIndexSet<RcStr>) {
        self.0
            .retain(|chunk_list| entry_paths.contains(&chunk_list.relative_path));
    }
}

/// What the server runtimes have loaded, as far as server HMR knows: the modules of every route
/// pulled since the server modules were last fully re-evaluated, and the modules shipped to the
/// runtimes since then.
///
/// Held in a project-global `State`. It describes the running process, so it is never persisted:
/// it encodes to nothing and decodes empty. (Skipping the whole `State` field instead would
/// recreate the `State` when decoding, which needs a task context.)
#[derive(Clone, Debug, Default, PartialEq, Eq, NonLocalValue, OperationValue)]
pub struct ServerHmrLoadedState {
    /// Module content hashes, by runtime directory (the chunks' output directory, which is how
    /// updates are routed to a runtime) and module id. Each runtime has its own module factories,
    /// and some ids (e.g. externals) are loaded by several runtimes.
    modules: FxHashMap<RcStr, FxHashMap<ModuleId, u128>>,
    /// Version ids of chunks that can't be expanded into modules, by chunk path.
    opaque_chunks: FxHashMap<RcStr, RcStr>,
    /// The routes pulled, by sorted entry paths.
    pulled_routes: FxHashSet<Vec<RcStr>>,
}

impl Encode for ServerHmrLoadedState {
    fn encode<E: Encoder>(&self, _encoder: &mut E) -> Result<(), EncodeError> {
        Ok(())
    }
}

impl<Context> Decode<Context> for ServerHmrLoadedState {
    fn decode<D: Decoder<Context = Context>>(_decoder: &mut D) -> Result<Self, DecodeError> {
        Ok(Self::default())
    }
}

impl_borrow_decode!(ServerHmrLoadedState);

impl ServerHmrLoadedState {
    /// Records a route's modules as loaded. Returns whether anything changed.
    fn record(&mut self, route: &ServerHmrRouteModules, entry_paths: Vec<RcStr>) -> bool {
        let mut changed = self.pulled_routes.insert(entry_paths);
        for runtime in &route.runtimes {
            if runtime.modules.is_empty() {
                continue;
            }
            let modules = self.modules.entry(runtime.dir.clone()).or_default();
            for (id, module) in &runtime.modules {
                changed |= modules.insert(id.clone(), module.hash) != Some(module.hash);
            }
        }
        for opaque in &route.opaque_chunks {
            changed |= self
                .opaque_chunks
                .insert(opaque.path.clone(), opaque.version_id.clone())
                .as_ref()
                != Some(&opaque.version_id);
        }
        changed
    }
}

#[derive(Clone, PartialEq, Eq, ValueDebugFormat, NonLocalValue)]
pub struct ServerHmrRouteChunk {
    pub content: ResolvedVc<Box<dyn EcmascriptHmrChunkContent>>,
    pub version: ReadRef<EcmascriptChunkVersion>,
}

/// A module of a route, in one runtime.
#[derive(Clone, Copy, Debug, PartialEq, Eq, ValueDebugFormat, NonLocalValue)]
pub struct ServerHmrRouteModule {
    /// The index of the chunk (in [`ServerHmrRouteRuntime::chunks`]) that ships the module.
    pub chunk: usize,
    pub hash: u128,
}

/// A route's chunks that one runtime loads, expanded into modules.
#[derive(Clone, PartialEq, Eq, ValueDebugFormat, NonLocalValue)]
pub struct ServerHmrRouteRuntime {
    /// The chunks' output directory, which identifies the runtime.
    pub dir: RcStr,
    pub chunks: Vec<ServerHmrRouteChunk>,
    /// Each module of the chunks, once.
    pub modules: FxIndexMap<ModuleId, ServerHmrRouteModule>,
}

/// A chunk that can't be expanded into modules.
#[derive(Clone, Debug, PartialEq, Eq, ValueDebugFormat, NonLocalValue)]
pub struct ServerHmrOpaqueChunk {
    pub path: RcStr,
    pub version_id: RcStr,
}

/// A route's chunks, by runtime.
#[turbo_tasks::value(serialization = "skip", shared)]
pub struct ServerHmrRouteModules {
    pub runtimes: Vec<ServerHmrRouteRuntime>,
    pub opaque_chunks: Vec<ServerHmrOpaqueChunk>,
}

impl ServerHmrRouteModules {
    pub async fn from_chunk_lists(chunk_lists: &[ServerHmrChunkList]) -> Result<Self> {
        let mut contents = FxIndexMap::default();
        for chunk_list in chunk_lists {
            let chunk_list = chunk_list.versioned_content.await?;
            for (path, content) in chunk_list.chunks_contents() {
                contents.insert(path.clone(), *content);
            }
        }

        let mut ecmascript = Vec::new();
        let mut opaque = Vec::new();
        for (path, content) in contents {
            match ResolvedVc::try_sidecast::<Box<dyn EcmascriptHmrChunkContent>>(content) {
                Some(content) => ecmascript.push(content),
                None => opaque.push((RcStr::from(path), content)),
            }
        }

        let chunks = ecmascript
            .into_iter()
            .map(async |content| {
                Ok(ServerHmrRouteChunk {
                    content,
                    version: content.ecmascript_chunk_version().await?,
                })
            })
            .try_join()
            .await?;
        let mut runtimes = FxIndexMap::<RcStr, ServerHmrRouteRuntime>::default();
        for chunk in chunks {
            let dir = runtime_dir(&chunk.version.chunk_path);
            let runtime = runtimes
                .entry(dir.clone())
                .or_insert_with(|| ServerHmrRouteRuntime {
                    dir,
                    chunks: Vec::new(),
                    modules: FxIndexMap::default(),
                });
            let index = runtime.chunks.len();
            for (id, &hash) in &chunk.version.entries_hashes {
                let module = runtime
                    .modules
                    .entry(id.clone())
                    .or_insert(ServerHmrRouteModule { chunk: index, hash });
                if module.hash != hash {
                    bail!(
                        "Chunks of server runtime {} disagree about the code of module {}",
                        runtime.dir,
                        id
                    );
                }
            }
            runtime.chunks.push(chunk);
        }

        let opaque_chunks = opaque
            .into_iter()
            .map(async |(path, content)| {
                Ok(ServerHmrOpaqueChunk {
                    path,
                    version_id: content.version().id().owned().await?,
                })
            })
            .try_join()
            .await?;
        Ok(Self {
            runtimes: runtimes.into_values().collect(),
            opaque_chunks,
        })
    }
}

/// The code of the requested modules, or `None` when any of them is gone or no longer has the
/// requested hash.
#[turbo_tasks::value(transparent, serialization = "skip")]
struct ServerHmrModuleEntries(Option<FxIndexMap<ModuleId, EcmascriptModuleEntry>>);

#[turbo_tasks::function(operation, root)]
async fn server_hmr_module_entries_operation(
    content: ResolvedVc<Box<dyn EcmascriptHmrChunkContent>>,
    chunk_path: RcStr,
    hashes: TransientInstance<FxIndexMap<ModuleId, u128>>,
) -> Result<Vc<ServerHmrModuleEntries>> {
    let entries = content.entries().await?;
    let Some(entries) = hashes
        .keys()
        .map(|id| entries.get(id).map(|entry| (id, entry)))
        .collect::<Option<Vec<_>>>()
    else {
        return Ok(Vc::cell(None));
    };
    let entries = entries
        .into_iter()
        .map(async |(id, entry)| {
            if *entry.hash.await? != hashes[id] {
                return Ok(None);
            }
            let entry = EcmascriptModuleEntry::from_code(id, *entry.code, &chunk_path).await?;
            Ok(Some((id.clone(), entry)))
        })
        .try_join()
        .await?;
    Ok(Vc::cell(entries.into_iter().collect()))
}

#[derive(Debug)]
pub enum ServerHmrUpdate {
    /// Nothing to ship.
    None,
    /// The runtimes can't be updated in place, so all server modules need to be re-evaluated.
    FullReevaluation,
    /// One update per runtime directory. Each update only touches chunks of its runtime.
    Partial(Vec<EcmascriptMergedUpdate>),
}

static TRACE_DIFFING: LazyLock<bool> = LazyLock::new(|| {
    cfg!(debug_assertions) && std::env::var_os("NEXT_TEST_SERVER_HMR_DIFFING").is_some()
});

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ServerHmrChunkListDiffEvent {
    #[serde(rename = "entryPath")]
    chunk_list_path: RcStr,
}

impl Display for ServerHmrChunkListDiffEvent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Diffing server HMR entry {}", self.chunk_list_path)
    }
}

impl CompilationEvent for ServerHmrChunkListDiffEvent {
    fn type_name(&self) -> &'static str {
        "ServerHmrEntryDiffEvent"
    }

    fn severity(&self) -> Severity {
        Severity::Trace
    }

    fn message(&self) -> String {
        self.to_string()
    }

    fn to_json(&self) -> String {
        serde_json::to_string(self).expect("server HMR entry diff event serializes")
    }
}

/// The directory of a chunk's path, which identifies the runtime that loads it.
fn runtime_dir(chunk_path: &str) -> RcStr {
    chunk_path
        .rsplit_once('/')
        .map_or("", |(dir, _)| dir)
        .into()
}

/// The modules of one chunk to ship.
#[derive(Default)]
struct ChunkShipment {
    /// The modules to ship, with the hash they're shipped at.
    hashes: FxIndexMap<ModuleId, u128>,
    /// Which of them the runtime doesn't have yet.
    added: FxIndexSet<ModuleId>,
}

/// The modules to ship to one runtime, by chunk index.
///
/// A module is shipped when the runtime has it at different code. A module the runtime doesn't
/// have yet is shipped when the route was pulled before (its code is already running and may now
/// import it), or when anything else is shipped to the runtime (a re-run self-accepting module may
/// import it). Otherwise the route's chunks install it when they load.
fn plan_runtime(
    runtime: &ServerHmrRouteRuntime,
    loaded: Option<&FxHashMap<ModuleId, u128>>,
    route_was_pulled: bool,
) -> FxIndexMap<usize, ChunkShipment> {
    let loaded_hash = |id: &ModuleId| loaded.and_then(|modules| modules.get(id));
    let any_outdated = runtime
        .modules
        .iter()
        .any(|(id, module)| loaded_hash(id).is_some_and(|hash| *hash != module.hash));
    let ship_missing = route_was_pulled || any_outdated;

    let mut shipments = FxIndexMap::<usize, ChunkShipment>::default();
    for (id, module) in &runtime.modules {
        let missing = match loaded_hash(id) {
            Some(hash) if *hash == module.hash => continue,
            Some(_) => false,
            None if ship_missing => true,
            None => continue,
        };
        let shipment = shipments.entry(module.chunk).or_default();
        shipment.hashes.insert(id.clone(), module.hash);
        if missing {
            shipment.added.insert(id.clone());
        }
    }
    shipments
}

/// Reads the code of the planned modules into one update for the runtime, or `None` when the code
/// no longer matches the plan.
async fn runtime_update(
    runtime: &ServerHmrRouteRuntime,
    shipments: FxIndexMap<usize, ChunkShipment>,
) -> Result<Option<EcmascriptMergedUpdate>> {
    let chunks = shipments
        .into_iter()
        .map(async |(index, ChunkShipment { hashes, added })| {
            let chunk = &runtime.chunks[index];
            let entries = server_hmr_module_entries_operation(
                chunk.content,
                chunk.version.chunk_path.clone(),
                TransientInstance::new(hashes),
            )
            .read_strongly_consistent()
            .await?;
            Ok((chunk, entries, added))
        })
        .try_join()
        .await?;

    let mut entries = FxIndexMap::default();
    let mut chunk_updates = FxIndexMap::default();
    for (chunk, chunk_entries, added) in chunks {
        let Some(chunk_entries) = &*chunk_entries else {
            return Ok(None);
        };
        entries.extend(
            chunk_entries
                .iter()
                .map(|(id, entry)| (id.clone(), entry.clone())),
        );
        chunk_updates.insert(
            chunk.version.chunk_path.clone(),
            EcmascriptMergedChunkUpdate::Partial(EcmascriptMergedChunkPartial {
                added: FrozenSet::from(added),
                deleted: FrozenSet::default(),
            }),
        );
    }
    Ok(Some(EcmascriptMergedUpdate {
        entries: FrozenMap::from(entries),
        chunks: FrozenMap::from(chunk_updates),
    }))
}

/// Computes the update that brings the server runtimes up to date for a requested route, by
/// diffing the route's modules against the modules the runtimes have loaded, and records the
/// route's modules as loaded.
///
/// Only the route's own modules are shipped, so modules of other routes are still evaluated
/// lazily, on their next request. See `plan_runtime` for which modules are shipped.
///
/// Kept outside Turbo Tasks: the loaded state is not a task input.
pub async fn compute_server_hmr_update(
    chunk_lists: &[ServerHmrChunkList],
    route: &ServerHmrRouteModules,
    mut entry_paths: Vec<RcStr>,
    loaded: &State<ServerHmrLoadedState>,
) -> Result<ServerHmrUpdate> {
    if *TRACE_DIFFING {
        for chunk_list in chunk_lists {
            turbo_tasks().send_compilation_event(Arc::new(ServerHmrChunkListDiffEvent {
                chunk_list_path: chunk_list.relative_path.clone(),
            }));
        }
    }
    entry_paths.sort();
    if route.runtimes.is_empty() && route.opaque_chunks.is_empty() {
        // Nothing of the route is built (e.g. its endpoint is gone), so nothing loads either.
        return Ok(ServerHmrUpdate::None);
    }

    let plans = {
        let loaded = loaded.get_untracked();

        // Non-ECMAScript chunks can't be updated in place.
        if route.opaque_chunks.iter().any(|opaque| {
            loaded
                .opaque_chunks
                .get(&opaque.path)
                .is_some_and(|version_id| *version_id != opaque.version_id)
        }) {
            return Ok(ServerHmrUpdate::FullReevaluation);
        }

        let route_was_pulled = loaded.pulled_routes.contains(&entry_paths);
        route
            .runtimes
            .iter()
            .map(|runtime| {
                let shipments =
                    plan_runtime(runtime, loaded.modules.get(&runtime.dir), route_was_pulled);
                (runtime, shipments)
            })
            .filter(|(_, shipments)| !shipments.is_empty())
            .collect::<Vec<_>>()
    };

    // The code is read after the module hashes were snapshotted, and a file may have changed in
    // between. Don't record or ship a plan whose code no longer matches.
    let updates = plans
        .into_iter()
        .map(async |(runtime, shipments)| runtime_update(runtime, shipments).await)
        .try_join()
        .await?;
    let Some(updates) = updates.into_iter().collect::<Option<Vec<_>>>() else {
        return Ok(ServerHmrUpdate::FullReevaluation);
    };

    loaded.update_conditionally(|loaded| loaded.record(route, entry_paths));

    if updates.is_empty() {
        return Ok(ServerHmrUpdate::None);
    }
    Ok(ServerHmrUpdate::Partial(updates))
}

/// Forgets what the server runtimes have loaded, and optionally records a route's modules as
/// loaded (the route the runtimes load next).
pub fn reset_server_hmr_state(
    loaded: &State<ServerHmrLoadedState>,
    route: Option<(&ServerHmrRouteModules, Vec<RcStr>)>,
) {
    let mut state = ServerHmrLoadedState::default();
    if let Some((route, mut entry_paths)) = route {
        entry_paths.sort();
        state.record(route, entry_paths);
    }
    loaded.set(state);
}
