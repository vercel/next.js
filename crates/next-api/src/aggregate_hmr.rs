use std::{
    fmt::Display,
    sync::{Arc, LazyLock},
};

use anyhow::Result;
use bincode::{
    Decode, Encode,
    de::Decoder,
    enc::Encoder,
    error::{DecodeError, EncodeError},
    impl_borrow_decode,
};
use rustc_hash::{FxHashMap, FxHashSet};
use serde::Serialize;
use smallvec::SmallVec;
use turbo_frozenmap::{FrozenMap, FrozenSet};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexMap, FxIndexSet, NonLocalValue, OperationValue, OperationVc, ReadRef, ResolvedVc, State,
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
    pub fn as_slice(&self) -> &[ServerHmrChunkList] {
        &self.0
    }
}

/// What the server runtimes have loaded, as far as server HMR knows: the modules of every route
/// pulled since the server modules were last fully re-evaluated, and the modules shipped to the
/// runtimes since then.
///
/// Held in a project-global `State`.
#[derive(Clone, Debug, Default, PartialEq, Eq, NonLocalValue, OperationValue)]
pub struct ServerHmrLoadedState {
    /// The code a runtime may have installed for a module, by runtime directory (the chunks'
    /// output directory, which is how updates are routed to a runtime) and module id. Each runtime
    /// has its own module factories, and some ids (e.g. externals) are loaded by several runtimes.
    ///
    /// Usually one piece of code. A runtime installs a module from whichever of its chunks loads
    /// first, so when the chunks have different code for the module (see
    /// [`ServerHmrRouteModule::code`]), any of them may be installed.
    modules: FxHashMap<RuntimeDirectory, FxHashMap<ModuleId, SmallVec<[InstalledCode; 1]>>>,
    /// Version ids of chunks that can't be expanded into modules, by chunk path.
    opaque_chunks: FxHashMap<RcStr, RcStr>,
    /// The routes pulled, by entry paths.
    pulled_routes: FxHashSet<FrozenSet<RcStr>>,
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

/// The output directory of a server runtime's chunks, which identifies the runtime: each runtime
/// has its own module factories, and updates are routed to a runtime by the directory of their
/// chunks.
#[derive(Clone, Debug, PartialEq, Eq, Hash, ValueDebugFormat, NonLocalValue, OperationValue)]
pub struct RuntimeDirectory(RcStr);

impl RuntimeDirectory {
    fn of_chunk(chunk_path: &str) -> Self {
        Self(
            chunk_path
                .rsplit_once('/')
                .map_or("", |(dir, _)| dir)
                .into(),
        )
    }
}

/// Code that a runtime may have installed for a module.
#[derive(Clone, Copy, Debug, PartialEq, Eq, NonLocalValue, OperationValue)]
struct InstalledCode {
    /// The hash of the installed code.
    hash: u128,
    /// The chunk the code was installed from. Read for the chunk's *current* version, to check
    /// whether it still has this code (see `outdated_modules`), so it is not a snapshot.
    chunk_version: OperationVc<EcmascriptChunkVersion>,
}

#[turbo_tasks::function(operation, root)]
fn server_hmr_chunk_version_operation(
    content: ResolvedVc<Box<dyn EcmascriptHmrChunkContent>>,
) -> Vc<EcmascriptChunkVersion> {
    content.ecmascript_chunk_version()
}

impl ServerHmrLoadedState {
    /// Records a route's modules as loaded, after the `outdated` ones (by runtime index) were
    /// shipped. Returns whether anything changed.
    fn record(
        &mut self,
        route: &ServerHmrRouteModules,
        entry_paths: FrozenSet<RcStr>,
        outdated: &[FxHashSet<ModuleId>],
    ) -> bool {
        let mut changed = self.pulled_routes.insert(entry_paths);
        for (index, runtime) in route.runtimes.iter().enumerate() {
            if runtime.modules.is_empty() {
                continue;
            }
            let outdated = outdated.get(index);
            let modules = self.modules.entry(runtime.output_dir.clone()).or_default();
            let mut chunk_versions = vec![None; runtime.chunks.len()];
            let mut installed_code = |code: &ServerHmrModuleCode| InstalledCode {
                hash: code.hash,
                chunk_version: *chunk_versions[code.chunk].get_or_insert_with(|| {
                    server_hmr_chunk_version_operation(runtime.chunks[code.chunk].content)
                }),
            };
            for (id, module) in &runtime.modules {
                match modules.get_mut(id) {
                    // Up to date modules stay installed as they are.
                    Some(_) if !outdated.is_some_and(|outdated| outdated.contains(id)) => {}
                    // Shipped.
                    Some(installed) => {
                        *installed = module
                            .code
                            .first()
                            .into_iter()
                            .map(&mut installed_code)
                            .collect();
                        changed = true;
                    }
                    // Installed from any of the route's chunks (or shipped).
                    None => {
                        let code = module.code.iter().map(&mut installed_code).collect();
                        modules.insert(id.clone(), code);
                        changed = true;
                    }
                }
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

/// Code that a route's chunks have for a module.
#[derive(Clone, Copy, Debug, PartialEq, Eq, ValueDebugFormat, NonLocalValue)]
pub struct ServerHmrModuleCode {
    /// The index of the chunk (in [`ServerHmrRouteRuntime::chunks`]) that has the code.
    pub chunk: usize,
    pub hash: u128,
}

/// A module of a route, in one runtime.
#[derive(Clone, Debug, Default, PartialEq, Eq, ValueDebugFormat, NonLocalValue)]
pub struct ServerHmrRouteModule {
    /// The distinct code the runtime's chunks have for the module. The first is shipped.
    ///
    /// Usually one piece of code. Async loaders, for example, only load the chunks that aren't
    /// available yet where they are imported, so their code depends on the chunk that has them.
    pub code: SmallVec<[ServerHmrModuleCode; 1]>,
}

impl ServerHmrRouteModule {
    fn has(&self, hash: u128) -> bool {
        self.code.iter().any(|code| code.hash == hash)
    }
}

/// A route's chunks that one runtime loads, expanded into modules.
#[derive(Clone, PartialEq, Eq, ValueDebugFormat, NonLocalValue)]
pub struct ServerHmrRouteRuntime {
    pub output_dir: RuntimeDirectory,
    pub chunks: Vec<ServerHmrRouteChunk>,
    pub modules: FxIndexMap<ModuleId, ServerHmrRouteModule>,
}

/// A chunk of a route's chunk lists whose content isn't ECMAScript, so it can't be expanded into
/// modules and only its version is compared. Server chunk lists normally only have ECMAScript
/// chunks (CSS and WebAssembly, for example, don't add any), but a chunk list can track any output
/// asset.
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
        let mut runtimes = FxIndexMap::<RuntimeDirectory, ServerHmrRouteRuntime>::default();
        for chunk in chunks {
            let dir = RuntimeDirectory::of_chunk(&chunk.version.chunk_path);
            let runtime = runtimes
                .entry(dir.clone())
                .or_insert_with(|| ServerHmrRouteRuntime {
                    output_dir: dir,
                    chunks: Vec::new(),
                    modules: FxIndexMap::default(),
                });
            let index = runtime.chunks.len();
            for (id, &hash) in &chunk.version.entries_hashes {
                let module = runtime.modules.entry(id.clone()).or_default();
                if !module.has(hash) {
                    module.code.push(ServerHmrModuleCode { chunk: index, hash });
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

/// Modules of a chunk to read, with the hash they're expected to have.
#[derive(NonLocalValue)]
struct ChunkModules {
    content: ResolvedVc<Box<dyn EcmascriptHmrChunkContent>>,
    chunk_path: RcStr,
    hashes: FxIndexMap<ModuleId, u128>,
}

/// The code of the requested modules, by request, or `None` when any of them is gone or no longer
/// has the requested hash.
#[turbo_tasks::value(transparent, serialization = "skip")]
struct ServerHmrModuleEntries(Option<Vec<FxIndexMap<ModuleId, EcmascriptModuleEntry>>>);

/// Reads the code of modules of several chunks, in one operation so that it is read strongly
/// consistently at once.
#[turbo_tasks::function(operation, root)]
async fn server_hmr_module_entries_operation(
    requests: TransientInstance<Vec<ChunkModules>>,
) -> Result<Vc<ServerHmrModuleEntries>> {
    let chunks = requests
        .iter()
        .map(async |request| {
            let entries = request.content.entries().await?;
            let Some(entries) = request
                .hashes
                .keys()
                .map(|id| entries.get(id).map(|entry| (id, entry)))
                .collect::<Option<Vec<_>>>()
            else {
                return Ok(None);
            };
            let entries = entries
                .into_iter()
                .map(async |(id, entry)| {
                    if *entry.hash.await? != request.hashes[id] {
                        return Ok(None);
                    }
                    let entry =
                        EcmascriptModuleEntry::from_code(id, *entry.code, &request.chunk_path)
                            .await?;
                    Ok(Some((id.clone(), entry)))
                })
                .try_join()
                .await?;
            Ok(entries.into_iter().collect::<Option<FxIndexMap<_, _>>>())
        })
        .try_join()
        .await?;
    Ok(Vc::cell(chunks.into_iter().collect()))
}

/// The current version of each of the chunks, or `None` for a chunk that can't be read anymore.
#[turbo_tasks::value(transparent, serialization = "skip")]
struct ServerHmrChunkVersions(Vec<Option<ReadRef<EcmascriptChunkVersion>>>);

/// Reads the versions of several chunks, in one operation so that they are read strongly
/// consistently at once.
#[turbo_tasks::function(operation, root)]
async fn server_hmr_chunk_versions_operation(
    chunk_versions: Vec<OperationVc<EcmascriptChunkVersion>>,
) -> Result<Vc<ServerHmrChunkVersions>> {
    let versions = chunk_versions
        .into_iter()
        .map(async |chunk_version| Ok(chunk_version.connect().await.ok()))
        .try_join()
        .await?;
    Ok(Vc::cell(versions))
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

/// The modules of one chunk to ship.
#[derive(Default)]
struct ChunkShipment {
    /// The modules to ship, with the hash they're shipped at.
    hashes: FxIndexMap<ModuleId, u128>,
    /// Which of them the runtime doesn't have yet.
    added: FxIndexSet<ModuleId>,
}

/// The modules to ship to one runtime, by chunk (parallel to [`ServerHmrRouteRuntime::chunks`]).
///
/// The `outdated` modules (see `outdated_modules`) are shipped. A module the runtime doesn't have
/// yet is shipped when the route was pulled before (its code is already running and may now import
/// it), or when anything else is shipped to the runtime (a re-run self-accepting module may import
/// it). Otherwise the route's chunks install it when they load.
fn plan_runtime(
    runtime: &ServerHmrRouteRuntime,
    loaded: Option<&FxHashMap<ModuleId, SmallVec<[InstalledCode; 1]>>>,
    outdated: &FxHashSet<ModuleId>,
    route_was_pulled: bool,
) -> Vec<ChunkShipment> {
    let ship_missing = route_was_pulled || !outdated.is_empty();

    let mut shipments = std::iter::repeat_with(ChunkShipment::default)
        .take(runtime.chunks.len())
        .collect::<Vec<_>>();
    for (id, module) in &runtime.modules {
        let missing = match loaded.is_some_and(|modules| modules.contains_key(id)) {
            true if outdated.contains(id) => false,
            true => continue,
            false if ship_missing => true,
            false => continue,
        };
        let Some(code) = module.code.first() else {
            continue;
        };
        let Some(shipment) = shipments.get_mut(code.chunk) else {
            continue;
        };
        shipment.hashes.insert(id.clone(), code.hash);
        if missing {
            shipment.added.insert(id.clone());
        }
    }
    shipments
}

/// Reads the code of the planned modules, by runtime (parallel to `plans`), into one update per
/// runtime, or `None` when the code no longer matches the plans.
async fn read_updates(
    plans: Vec<(&ServerHmrRouteRuntime, Vec<ChunkShipment>)>,
) -> Result<Option<Vec<EcmascriptMergedUpdate>>> {
    let plan_count = plans.len();
    let mut requests = Vec::new();
    // The plan and added modules of each request.
    let mut shipped = Vec::new();
    for (plan, (runtime, shipments)) in plans.into_iter().enumerate() {
        for (chunk, ChunkShipment { hashes, added }) in runtime.chunks.iter().zip(shipments) {
            if hashes.is_empty() {
                continue;
            }
            requests.push(ChunkModules {
                content: chunk.content,
                chunk_path: chunk.version.chunk_path.clone(),
                hashes,
            });
            shipped.push((plan, chunk.version.chunk_path.clone(), added));
        }
    }
    if requests.is_empty() {
        return Ok(Some(Vec::new()));
    }

    let entries = server_hmr_module_entries_operation(TransientInstance::new(requests))
        .read_strongly_consistent()
        .await?;
    let Some(entries) = &*entries else {
        return Ok(None);
    };

    let mut updates = std::iter::repeat_with(|| (FxIndexMap::default(), FxIndexMap::default()))
        .take(plan_count)
        .collect::<Vec<_>>();
    for ((plan, chunk_path, added), chunk_entries) in shipped.into_iter().zip(entries) {
        let Some((entries, chunks)) = updates.get_mut(plan) else {
            continue;
        };
        entries.extend(
            chunk_entries
                .iter()
                .map(|(id, entry)| (id.clone(), entry.clone())),
        );
        chunks.insert(
            chunk_path,
            EcmascriptMergedChunkUpdate::Partial(EcmascriptMergedChunkPartial {
                added: FrozenSet::from(added),
                deleted: FrozenSet::default(),
            }),
        );
    }
    Ok(Some(
        updates
            .into_iter()
            .map(|(entries, chunks)| EcmascriptMergedUpdate {
                entries: FrozenMap::from(entries),
                chunks: FrozenMap::from(chunks),
            })
            .collect(),
    ))
}

/// The modules of each of the route's runtimes that the runtime may have at code that isn't
/// current.
///
/// Installed code is current when the route has it too. Otherwise, it may still be current, from a
/// chunk with different code for the module (see [`ServerHmrRouteModule::code`]), so the chunk it
/// is from is checked. Shipping it again would replace one valid piece of code with another, on
/// every request alternating between routes that disagree.
async fn outdated_modules(
    route: &ServerHmrRouteModules,
    loaded: &State<ServerHmrLoadedState>,
) -> Result<Vec<FxHashSet<ModuleId>>> {
    // Installed code the route doesn't have, with the index of the chunk it is from.
    let mut chunk_versions = FxIndexSet::default();
    let mut unknown = Vec::new();
    {
        // Untracked, like every read of the loaded state: it is only used outside of tasks.
        let loaded = loaded.get_untracked();
        for (index, runtime) in route.runtimes.iter().enumerate() {
            let Some(installed) = loaded.modules.get(&runtime.output_dir) else {
                continue;
            };
            for (id, module) in &runtime.modules {
                for code in installed.get(id).into_iter().flatten() {
                    if !module.has(code.hash) {
                        let (chunk, _) = chunk_versions.insert_full(code.chunk_version);
                        unknown.push((index, id.clone(), code.hash, chunk));
                    }
                }
            }
        }
    }

    let mut outdated = vec![FxHashSet::default(); route.runtimes.len()];
    if unknown.is_empty() {
        return Ok(outdated);
    }
    let versions = server_hmr_chunk_versions_operation(chunk_versions.into_iter().collect())
        .read_strongly_consistent()
        .await?;
    for (index, id, hash, chunk) in unknown {
        // A chunk that can't be read anymore doesn't have the code either.
        let current = versions
            .get(chunk)
            .and_then(Option::as_ref)
            .is_some_and(|version| version.entries_hashes.get(&id) == Some(&hash));
        if !current {
            outdated[index].insert(id);
        }
    }
    Ok(outdated)
}

/// Computes the update that brings the server runtimes up to date for a requested route, by
/// diffing the route's modules against the modules the runtimes have loaded, and records the
/// route's modules as loaded.
///
/// Only the route's own modules are shipped, so modules of other routes are still evaluated
/// lazily, on their next request. See `plan_runtime` for which modules are shipped.
///
/// Kept outside Turbo Tasks: the loaded state is not a task input. No task depends on it, so it is
/// read untracked.
pub async fn compute_server_hmr_update(
    chunk_lists: &[ServerHmrChunkList],
    route: &ServerHmrRouteModules,
    entry_paths: FrozenSet<RcStr>,
    loaded: &State<ServerHmrLoadedState>,
) -> Result<ServerHmrUpdate> {
    if *TRACE_DIFFING {
        for chunk_list in chunk_lists {
            turbo_tasks().send_compilation_event(Arc::new(ServerHmrChunkListDiffEvent {
                chunk_list_path: chunk_list.relative_path.clone(),
            }));
        }
    }
    if route.runtimes.is_empty() && route.opaque_chunks.is_empty() {
        // Nothing of the route is built (e.g. its endpoint is gone), so nothing loads either.
        return Ok(ServerHmrUpdate::None);
    }

    if route.opaque_chunks.iter().any(|opaque| {
        loaded
            .get_untracked()
            .opaque_chunks
            .get(&opaque.path)
            .is_some_and(|version_id| *version_id != opaque.version_id)
    }) {
        // Non-ECMAScript chunks can't be updated in place.
        return Ok(ServerHmrUpdate::FullReevaluation);
    }

    let outdated = outdated_modules(route, loaded).await?;
    let plans = {
        let loaded = loaded.get_untracked();
        let route_was_pulled = loaded.pulled_routes.contains(&entry_paths);
        route
            .runtimes
            .iter()
            .zip(&outdated)
            .map(|(runtime, outdated)| {
                let shipments = plan_runtime(
                    runtime,
                    loaded.modules.get(&runtime.output_dir),
                    outdated,
                    route_was_pulled,
                );
                (runtime, shipments)
            })
            .filter(|(_, shipments)| shipments.iter().any(|shipment| !shipment.hashes.is_empty()))
            .collect::<Vec<_>>()
    };

    // The code is read after the module hashes were snapshotted, and a file may have changed in
    // between. Don't record or ship a plan whose code no longer matches.
    let Some(updates) = read_updates(plans).await? else {
        return Ok(ServerHmrUpdate::FullReevaluation);
    };

    loaded.update_conditionally(|loaded| loaded.record(route, entry_paths, &outdated));

    if updates.is_empty() {
        return Ok(ServerHmrUpdate::None);
    }
    Ok(ServerHmrUpdate::Partial(updates))
}

/// Forgets what the server runtimes have loaded, and optionally records a route's modules as
/// loaded (the route the runtimes load next).
pub fn reset_server_hmr_state(
    loaded: &State<ServerHmrLoadedState>,
    route: Option<(&ServerHmrRouteModules, FrozenSet<RcStr>)>,
) {
    let mut state = ServerHmrLoadedState::default();
    if let Some((route, entry_paths)) = route {
        state.record(route, entry_paths, &[]);
    }
    loaded.set(state);
}
