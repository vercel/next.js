use std::future::Future;

use anyhow::Result;
use rustc_hash::FxHashSet;
use serde::{Deserialize, Serialize};
use tracing::{Instrument, Level, Span};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexSet, NonLocalValue, ReadRef, ResolvedVc, TryJoinIterExt, Vc,
    debug::ValueDebugFormat,
    graph::{AdjacencyMap, GraphTraversal, Visit, VisitControlFlow},
    trace::TraceRawVcs,
};
use turbopack::css::chunk::CssChunkPlaceable;
use turbopack_core::{
    chunk::ChunkingType, module::Module, reference::primary_chunkable_referenced_modules,
};

use crate::{
    next_client_reference::{
        CssClientReferenceModule,
        ecmascript_client_reference::ecmascript_client_reference_module::EcmascriptClientReferenceModule,
    },
    next_server_component::server_component_module::NextServerComponentModule,
    next_server_utility::server_utility_module::NextServerUtilityModule,
};

#[derive(
    Copy,
    Clone,
    Eq,
    PartialEq,
    Hash,
    Serialize,
    Deserialize,
    Debug,
    ValueDebugFormat,
    TraceRawVcs,
    NonLocalValue,
)]
pub struct ClientReference {
    pub server_component: Option<ResolvedVc<NextServerComponentModule>>,
    pub ty: ClientReferenceType,
}

impl ClientReference {
    pub fn server_component(&self) -> Option<ResolvedVc<NextServerComponentModule>> {
        self.server_component
    }

    pub fn ty(&self) -> ClientReferenceType {
        self.ty
    }
}

#[turbo_tasks::value(transparent)]
pub struct ClientReferences(Vec<ClientReference>);

#[derive(
    Copy,
    Clone,
    Eq,
    PartialEq,
    Hash,
    Serialize,
    Deserialize,
    Debug,
    ValueDebugFormat,
    TraceRawVcs,
    NonLocalValue,
)]
pub enum ClientReferenceType {
    EcmascriptClientReference(ResolvedVc<EcmascriptClientReferenceModule>),
    CssClientReference(ResolvedVc<Box<dyn CssChunkPlaceable>>),
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug, Default)]
pub struct ClientReferenceGraphResult {
    pub client_references: Vec<ClientReference>,
    pub server_component_entries: Vec<ResolvedVc<NextServerComponentModule>>,
    pub server_utils: Vec<ResolvedVc<NextServerUtilityModule>>,
}

#[turbo_tasks::value(shared)]
pub struct VisitedClientReferenceGraphNodes(FxHashSet<FindServerEntriesNode>);

#[turbo_tasks::value_impl]
impl VisitedClientReferenceGraphNodes {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        VisitedClientReferenceGraphNodes(Default::default()).cell()
    }
}

#[turbo_tasks::value(transparent)]
pub struct ClientReferenceTypes(FxIndexSet<ClientReferenceType>);

#[turbo_tasks::value_impl]
impl ClientReferenceGraphResult {
    #[turbo_tasks::function]
    pub fn types(&self) -> Vc<ClientReferenceTypes> {
        Vc::cell(
            self.client_references
                .iter()
                .map(|r| r.ty())
                .collect::<FxIndexSet<_>>(),
        )
    }
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub struct ServerEntries {
    pub server_component_entries: Vec<ResolvedVc<NextServerComponentModule>>,
    pub server_utils: Vec<ResolvedVc<NextServerUtilityModule>>,
}

/// For a given RSC entry, finds all server components (i.e. layout segments) and server utils that
/// are referenced by the entry.
#[turbo_tasks::function]
pub async fn find_server_entries(
    entry: ResolvedVc<Box<dyn Module>>,
    include_traced: bool,
) -> Result<Vc<ServerEntries>> {
    async move {
        let emit_spans = tracing::enabled!(Level::INFO);
        let graph = AdjacencyMap::new()
            .skip_duplicates()
            .visit(
                vec![FindServerEntriesNode::Internal(
                    entry,
                    if emit_spans {
                        // INVALIDATION: we don't need to invalidate when the span name changes
                        Some(entry.ident_string().untracked().await?)
                    } else {
                        None
                    },
                )],
                FindServerEntries {
                    include_traced,
                    emit_spans,
                },
            )
            .await
            .completed()?
            .into_inner();

        let mut server_component_entries = vec![];
        let mut server_utils = vec![];
        for node in graph.postorder_topological() {
            match node {
                FindServerEntriesNode::ServerUtilEntry(server_util, _) => {
                    server_utils.push(*server_util);
                }
                FindServerEntriesNode::ServerComponentEntry(server_component, _) => {
                    server_component_entries.push(*server_component);
                }
                FindServerEntriesNode::Internal(_, _) | FindServerEntriesNode::ClientReference => {}
            }
        }

        Ok(ServerEntries {
            server_component_entries,
            server_utils,
        }
        .cell())
    }
    .instrument(tracing::info_span!("find server entries"))
    .await
}

struct FindServerEntries {
    /// Whether to walk ChunkingType::Traced references
    include_traced: bool,
    emit_spans: bool,
}

#[derive(
    Clone,
    Eq,
    PartialEq,
    Hash,
    Serialize,
    Deserialize,
    Debug,
    ValueDebugFormat,
    TraceRawVcs,
    NonLocalValue,
)]
enum FindServerEntriesNode {
    ClientReference,
    ServerComponentEntry(
        ResolvedVc<NextServerComponentModule>,
        Option<ReadRef<RcStr>>,
    ),
    ServerUtilEntry(ResolvedVc<NextServerUtilityModule>, Option<ReadRef<RcStr>>),
    Internal(ResolvedVc<Box<dyn Module>>, Option<ReadRef<RcStr>>),
}

impl Visit<FindServerEntriesNode> for FindServerEntries {
    type Edge = FindServerEntriesNode;
    type EdgesIntoIter = Vec<Self::Edge>;
    type EdgesFuture = impl Future<Output = Result<Self::EdgesIntoIter>>;

    fn visit(&mut self, edge: Self::Edge) -> VisitControlFlow<FindServerEntriesNode> {
        match edge {
            FindServerEntriesNode::Internal(..) => VisitControlFlow::Continue(edge),
            FindServerEntriesNode::ClientReference
            | FindServerEntriesNode::ServerUtilEntry(..)
            | FindServerEntriesNode::ServerComponentEntry(..) => VisitControlFlow::Skip(edge),
        }
    }

    fn edges(&mut self, node: &FindServerEntriesNode) -> Self::EdgesFuture {
        let include_traced = self.include_traced;
        let parent_module = match node {
            // This should never occur since we always skip visiting these
            // nodes' edges.
            FindServerEntriesNode::ClientReference => {
                unreachable!("ClientReference node should not be visited")
            }
            FindServerEntriesNode::Internal(module, _) => **module,
            FindServerEntriesNode::ServerUtilEntry(module, _) => Vc::upcast(**module),
            FindServerEntriesNode::ServerComponentEntry(module, _) => Vc::upcast(**module),
        };
        let emit_spans = self.emit_spans;
        async move {
            // Pass include_traced to reuse the same cached `primary_chunkable_referenced_modules`
            // task result, but the traced references will be filtered out again afterwards.
            let referenced_modules =
                primary_chunkable_referenced_modules(parent_module, include_traced).await?;

            let referenced_modules = referenced_modules
                .iter()
                .flat_map(|(chunking_type, _, modules)| match chunking_type {
                    ChunkingType::Traced => None,
                    _ => Some(modules.iter()),
                })
                .flatten()
                .map(async |module| {
                    if ResolvedVc::try_downcast_type::<EcmascriptClientReferenceModule>(*module)
                        .is_some()
                        || ResolvedVc::try_downcast_type::<CssClientReferenceModule>(*module)
                            .is_some()
                    {
                        return Ok(FindServerEntriesNode::ClientReference);
                    }

                    if let Some(server_component_asset) =
                        ResolvedVc::try_downcast_type::<NextServerComponentModule>(*module)
                    {
                        return Ok(FindServerEntriesNode::ServerComponentEntry(
                            server_component_asset,
                            if emit_spans {
                                // INVALIDATION: we don't need to invalidate when the span name
                                // changes
                                Some(server_component_asset.ident_string().untracked().await?)
                            } else {
                                None
                            },
                        ));
                    }

                    if let Some(server_util_module) =
                        ResolvedVc::try_downcast_type::<NextServerUtilityModule>(*module)
                    {
                        return Ok(FindServerEntriesNode::ServerUtilEntry(
                            server_util_module,
                            if emit_spans {
                                // INVALIDATION: we don't need to invalidate when the span name
                                // changes
                                Some(module.ident_string().untracked().await?)
                            } else {
                                None
                            },
                        ));
                    }

                    Ok(FindServerEntriesNode::Internal(
                        *module,
                        if emit_spans {
                            // INVALIDATION: we don't need to invalidate when the span name changes
                            Some(module.ident_string().untracked().await?)
                        } else {
                            None
                        },
                    ))
                });

            let assets = referenced_modules.try_join().await?;

            Ok(assets)
        }
    }

    fn span(&mut self, node: &FindServerEntriesNode) -> tracing::Span {
        if !self.emit_spans {
            return Span::current();
        }
        match node {
            FindServerEntriesNode::ClientReference => {
                tracing::info_span!("client reference")
            }
            FindServerEntriesNode::Internal(_, name) => {
                tracing::info_span!("module", name = display(name.as_ref().unwrap()))
            }
            FindServerEntriesNode::ServerUtilEntry(_, name) => {
                tracing::info_span!("server util", name = display(name.as_ref().unwrap()))
            }
            FindServerEntriesNode::ServerComponentEntry(_, name) => {
                tracing::info_span!("layout segment", name = display(name.as_ref().unwrap()))
            }
        }
    }
}
