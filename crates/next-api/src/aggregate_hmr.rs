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
    update_instruction::UpdateInstruction,
    version::{Version, VersionedContent},
};
use turbopack_ecmascript::{
    chunk_list::{
        merged_update::{
            EcmascriptMergedChunkPartial, EcmascriptMergedChunkUpdate, EcmascriptMergedUpdate,
            EcmascriptModuleEntry,
        },
        update::ChunkListUpdate,
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
/// it encodes to nothing and decodes empty.
#[derive(Clone, Debug, Default, PartialEq, Eq, NonLocalValue, OperationValue)]
pub struct ServerHmrLoadedState {
    /// Module content hashes, keyed by runtime directory (the chunks' output directory, which is
    /// how updates are routed to a runtime) and module id.
    modules: FxHashMap<(RcStr, ModuleId), u128>,
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

#[derive(Clone, PartialEq, Eq, ValueDebugFormat, NonLocalValue)]
pub struct ServerHmrRouteChunk {
    pub content: ResolvedVc<Box<dyn EcmascriptHmrChunkContent>>,
    pub version: ReadRef<EcmascriptChunkVersion>,
}

/// A route's chunks, expanded into modules.
#[turbo_tasks::value(serialization = "skip", shared)]
pub struct ServerHmrRouteModules {
    pub chunks: Vec<ServerHmrRouteChunk>,
    /// Chunks that can't be expanded into modules, as (chunk path, version id).
    pub opaque_chunks: Vec<(RcStr, RcStr)>,
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
        let opaque_chunks = opaque
            .into_iter()
            .map(async |(path, content)| Ok((path, content.version().id().owned().await?)))
            .try_join()
            .await?;
        Ok(Self {
            chunks,
            opaque_chunks,
        })
    }
}

/// Shipped modules with the hash of the code that is shipped.
#[turbo_tasks::value(transparent, serialization = "skip")]
struct ServerHmrModuleEntries(Vec<(ModuleId, u128, EcmascriptModuleEntry)>);

#[turbo_tasks::function(operation, root)]
async fn server_hmr_module_entries_operation(
    content: ResolvedVc<Box<dyn EcmascriptHmrChunkContent>>,
    chunk_path: RcStr,
    ids: TransientInstance<Vec<ModuleId>>,
) -> Result<Vc<ServerHmrModuleEntries>> {
    let entries = content.entries().await?;
    let entries = ids
        .iter()
        .filter_map(|id| entries.get(id).map(|entry| (id, entry)))
        .map(async |(id, entry)| {
            let hash = *entry.hash.await?;
            let entry = EcmascriptModuleEntry::from_code(id, *entry.code, &chunk_path).await?;
            Ok((id.clone(), hash, entry))
        })
        .try_join()
        .await?;
    Ok(Vc::cell(entries))
}

#[derive(Debug)]
pub enum ServerHmrUpdate {
    /// Nothing to ship.
    None,
    /// The runtimes can't be updated in place, so all server modules need to be re-evaluated.
    FullReevaluation,
    Partial(UpdateInstruction),
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

/// The modules of one chunk to ship, and which of them the runtime doesn't have yet.
#[derive(Default)]
struct ChunkShipment {
    ids: Vec<ModuleId>,
    added: FxIndexSet<ModuleId>,
}

/// Computes the update that brings the server runtimes up to date for a requested route, by
/// diffing the route's modules against the modules the runtimes have loaded, and records the
/// route's modules as loaded.
///
/// Only the route's own modules are shipped, so modules of other routes are still evaluated
/// lazily, on their next request. Per runtime directory, a route module is shipped when the
/// runtime has it at different code. A module the runtime doesn't have yet is shipped when the
/// route was pulled before (its code is already running and may now import it), or when anything
/// else is shipped to that runtime (a re-run self-accepting module may import it). Otherwise the
/// route's chunks install it when they load.
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
    if route.chunks.is_empty() && route.opaque_chunks.is_empty() {
        // Nothing of the route is built (e.g. its endpoint is gone), so nothing loads either.
        return Ok(ServerHmrUpdate::None);
    }

    let mut shipments = FxIndexMap::<usize, ChunkShipment>::default();
    {
        let loaded = loaded.get_untracked();

        // Non-ECMAScript chunks can't be updated in place.
        if route.opaque_chunks.iter().any(|(path, id)| {
            loaded
                .opaque_chunks
                .get(path)
                .is_some_and(|loaded_id| loaded_id != id)
        }) {
            return Ok(ServerHmrUpdate::FullReevaluation);
        }

        let route_was_pulled = loaded.pulled_routes.contains(&entry_paths);
        let mut seen = FxHashMap::default();
        // Per runtime directory: the outdated modules, and the modules it doesn't have yet.
        let mut by_dir = FxIndexMap::<RcStr, (Vec<_>, Vec<_>)>::default();
        for (index, chunk) in route.chunks.iter().enumerate() {
            let dir = runtime_dir(&chunk.version.chunk_path);
            for (id, hash) in &chunk.version.entries_hashes {
                if let Some(seen_hash) = seen.insert((dir.clone(), id), *hash) {
                    if seen_hash != *hash {
                        // Chunks of a runtime disagree about a module's code.
                        return Ok(ServerHmrUpdate::FullReevaluation);
                    }
                    continue;
                }
                let (outdated, missing) = by_dir.entry(dir.clone()).or_default();
                match loaded.modules.get(&(dir.clone(), id.clone())) {
                    Some(loaded_hash) if loaded_hash == hash => {}
                    Some(_) => outdated.push((index, id)),
                    None => missing.push((index, id)),
                }
            }
        }

        for (outdated, missing) in by_dir.into_values() {
            let ship_missing = route_was_pulled || !outdated.is_empty();
            for (index, id) in outdated {
                shipments.entry(index).or_default().ids.push(id.clone());
            }
            if ship_missing {
                for (index, id) in missing {
                    let shipment = shipments.entry(index).or_default();
                    shipment.ids.push(id.clone());
                    shipment.added.insert(id.clone());
                }
            }
        }
    }

    // The code is read after the module hashes were snapshotted, and a file may have changed in
    // between. Don't record or ship a plan whose code no longer matches.
    let shipped_chunks = shipments
        .into_iter()
        .map(async |(index, ChunkShipment { ids, added })| {
            let chunk = &route.chunks[index];
            let entries = server_hmr_module_entries_operation(
                chunk.content,
                chunk.version.chunk_path.clone(),
                TransientInstance::new(ids.clone()),
            )
            .read_strongly_consistent()
            .await?;
            Ok((chunk, ids, entries, added))
        })
        .try_join()
        .await?;

    let mut merged_by_dir = FxIndexMap::<RcStr, (FxIndexMap<_, _>, FxIndexMap<_, _>)>::default();
    for (chunk, ids, entries, added) in shipped_chunks {
        if entries.len() != ids.len()
            || entries
                .iter()
                .zip(&ids)
                .any(|((id, hash, _), requested_id)| {
                    id != requested_id || chunk.version.entries_hashes.get(id) != Some(hash)
                })
        {
            return Ok(ServerHmrUpdate::FullReevaluation);
        }
        let (merged_entries, merged_chunks) = merged_by_dir
            .entry(runtime_dir(&chunk.version.chunk_path))
            .or_default();
        for (id, _, entry) in entries.iter() {
            merged_entries.insert(id.clone(), entry.clone());
        }
        merged_chunks.insert(
            chunk.version.chunk_path.clone(),
            EcmascriptMergedChunkUpdate::Partial(EcmascriptMergedChunkPartial {
                added: FrozenSet::from(added),
                deleted: FrozenSet::default(),
            }),
        );
    }

    loaded.update_conditionally(|loaded| {
        for chunk in &route.chunks {
            let dir = runtime_dir(&chunk.version.chunk_path);
            for (id, hash) in &chunk.version.entries_hashes {
                loaded.modules.insert((dir.clone(), id.clone()), *hash);
            }
        }
        for (path, id) in &route.opaque_chunks {
            loaded.opaque_chunks.insert(path.clone(), id.clone());
        }
        loaded.pulled_routes.insert(entry_paths);
        true
    });

    if merged_by_dir.is_empty() {
        return Ok(ServerHmrUpdate::None);
    }
    Ok(ServerHmrUpdate::Partial(
        ChunkListUpdate {
            chunks: Default::default(),
            merged: merged_by_dir
                .into_values()
                .map(|(entries, chunks)| EcmascriptMergedUpdate {
                    entries: FrozenMap::from(entries),
                    chunks: FrozenMap::from(chunks),
                })
                .collect(),
        }
        .into_instruction(),
    ))
}
