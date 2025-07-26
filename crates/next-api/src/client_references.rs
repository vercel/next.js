use anyhow::Result;
use next_core::{
    next_client_reference::{CssClientReferenceModule, EcmascriptClientReferenceModule},
    next_server_component::server_component_module::NextServerComponentModule,
};
use roaring::RoaringBitmap;
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    FxIndexSet, NonLocalValue, ResolvedVc, TryFlatJoinIterExt, Vc, debug::ValueDebugFormat,
    trace::TraceRawVcs,
};
use turbopack::css::chunk::CssChunkPlaceable;
use turbopack_core::{
    module::Module,
    module_graph::{
        GraphTraversalAction, SingleModuleGraph, SingleModuleGraphModuleNode,
        chunk_group_info::RoaringBitmapWrapper,
    },
};

#[derive(
    Copy, Clone, Serialize, Deserialize, Eq, PartialEq, TraceRawVcs, ValueDebugFormat, NonLocalValue,
)]
pub enum ClientManifestEntryType {
    EcmascriptClientReference {
        module: ResolvedVc<EcmascriptClientReferenceModule>,
        ssr_module: ResolvedVc<Box<dyn Module>>,
    },
    CssClientReference(ResolvedVc<Box<dyn CssChunkPlaceable>>),
    ServerComponent(ResolvedVc<NextServerComponentModule>),
}

/// Tracks information about all the css and js client references in the graph as well as how server
/// components depend on them.
#[turbo_tasks::value]
pub struct ClientReferenceManifest {
    pub manifest: FxHashMap<ResolvedVc<Box<dyn Module>>, ClientManifestEntryType>,
    // All the server components in the graph.
    server_components: FxIndexSet<ResolvedVc<NextServerComponentModule>>,
    // All the server components that depend on each module
    // This only includes mappings for modules with client references and the bitmaps reference
    // indices into `[server_components]`
    server_components_for_client_references:
        FxHashMap<ResolvedVc<Box<dyn Module>>, RoaringBitmapWrapper>,
}

impl ClientReferenceManifest {
    /// Returns all the server components that depend on the given client reference
    pub fn server_components_for_client_reference(
        &self,
        module: ResolvedVc<Box<dyn Module>>,
    ) -> impl Iterator<Item = ResolvedVc<NextServerComponentModule>> {
        let bitmap = &self
            .server_components_for_client_references
            .get(&module)
            .expect("Module should be a client reference module")
            .0;

        bitmap
            .iter()
            .map(|index| *self.server_components.get_index(index as usize).unwrap())
    }
}

#[turbo_tasks::function]
pub async fn map_client_references(
    graph: Vc<SingleModuleGraph>,
) -> Result<Vc<ClientReferenceManifest>> {
    let graph = graph.await?;
    let manifest = graph
        .iter_nodes()
        .map(|node| async move {
            let module = node.module;

            if let Some(client_reference_module) =
                ResolvedVc::try_downcast_type::<EcmascriptClientReferenceModule>(module)
            {
                Ok(Some((
                    module,
                    ClientManifestEntryType::EcmascriptClientReference {
                        module: client_reference_module,
                        ssr_module: ResolvedVc::upcast(client_reference_module.await?.ssr_module),
                    },
                )))
            } else if let Some(client_reference_module) =
                ResolvedVc::try_downcast_type::<CssClientReferenceModule>(module)
            {
                Ok(Some((
                    module,
                    ClientManifestEntryType::CssClientReference(
                        client_reference_module.await?.client_module,
                    ),
                )))
            } else if let Some(server_component) =
                ResolvedVc::try_downcast_type::<NextServerComponentModule>(module)
            {
                Ok(Some((
                    module,
                    ClientManifestEntryType::ServerComponent(server_component),
                )))
            } else {
                Ok(None)
            }
        })
        .try_flat_join()
        .await?
        .into_iter()
        .collect::<FxHashMap<_, _>>();

    let mut server_components = FxIndexSet::default();
    let mut module_to_server_component_bits = FxHashMap::default();
    if !manifest.is_empty() {
        graph.traverse_edges_from_entries_fixed_point(
            graph.entry_modules(),
            |parent_info, node| {
                let module = node.module();
                let module_type = manifest.get(&module);
                let mut should_visit_children = match module_to_server_component_bits.entry(module)
                {
                    std::collections::hash_map::Entry::Occupied(_) => false,
                    std::collections::hash_map::Entry::Vacant(vacant_entry) => {
                        // only do this the first time we visit the node.
                        let bits = vacant_entry.insert(RoaringBitmap::new());
                        if let Some(ClientManifestEntryType::ServerComponent(
                            server_component_module,
                        )) = module_type
                        {
                            let index = server_components.insert_full(*server_component_module).0;

                            bits.insert(index.try_into().unwrap());
                        }
                        true
                    }
                };
                if let Some((SingleModuleGraphModuleNode{module: parent_module}, _)) = parent_info
                    // Skip self cycles such as in
                    // test/e2e/app-dir/dynamic-import/app/page.tsx where a very-dynamic import induces a
                    // self cycle. They don't introduce new bits anyway.
                    && module != *parent_module
                {
                    // Copy parent bits down.  `traverse_edges_from_entries_fixed_point` always
                    // visits parents before children so we can simply assert
                    // that the parent it set.
                    let [Some(current), Some(parent)] =
                        module_to_server_component_bits.get_disjoint_mut([&module, parent_module])
                    else {
                        unreachable!()
                    };
                    // Check if we are adding new bits and thus need to revisit children unless we
                    // are already planning to because this is a new node.
                    if !should_visit_children {
                        let len = current.len();
                        *current |= &*parent;
                        // did we find new bits? If so visit the children again
                        should_visit_children = len != current.len();
                    } else {
                        *current |= &*parent;
                    }
                }

                Ok(match module_type {
                    Some(
                        ClientManifestEntryType::EcmascriptClientReference { .. }
                        | ClientManifestEntryType::CssClientReference { .. },
                    ) => {
                        // No need to explore these subgraphs ever, these are the leaves in the
                        // server component graph
                        GraphTraversalAction::Skip
                    }
                    // Continue on server components and through graphs of non-ClientReference
                    // modules, but only if our set of parent components has changed.
                    _ => {
                        if should_visit_children {
                            GraphTraversalAction::Continue
                        } else {
                            GraphTraversalAction::Skip
                        }
                    }
                })
            },
        )?;
    }

    // Filter down to just the client reference modules to reduce datastructure size
    let server_components_for_client_references = module_to_server_component_bits
        .into_iter()
        .filter_map(|(k, v)| match manifest.get(&k) {
            Some(
                ClientManifestEntryType::CssClientReference(_)
                | ClientManifestEntryType::EcmascriptClientReference { .. },
            ) => Some((k, RoaringBitmapWrapper(v))),
            _ => None,
        })
        .collect();

    Ok(ClientReferenceManifest::cell(ClientReferenceManifest {
        manifest,
        server_components,
        server_components_for_client_references,
    }))
}
