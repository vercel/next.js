//! Actual graph edges whose module evaluation can demand an asynchronous value.
use std::ops::Deref;

use anyhow::Result;
use bincode::{Decode, Encode};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};

use crate::{
    module::{Module, Modules},
    reference::ModuleReference,
};

/// The source reference and the execution owner remain separate identities.
#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub struct RuntimeImportDemandEdge {
    pub owner: ResolvedVc<Box<dyn Module>>,
    pub target: ResolvedVc<Box<dyn Module>>,
    pub reference: ResolvedVc<Box<dyn ModuleReference>>,
    pub site: u32,
    pub source_order: u32,
    pub evaluation_only: bool,
}

/// The exact compiler part edge carrying an earlier native prerequisite.
#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub struct RuntimeImportNativePart {
    pub reference: ResolvedVc<Box<dyn ModuleReference>>,
    pub module: ResolvedVc<Box<dyn Module>>,
}

/// A native import retains its real loader at its certified source position.
#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub struct RuntimeImportNativeEdge {
    pub via_part: Option<ResolvedVc<RuntimeImportNativePart>>,
    pub owner: ResolvedVc<Box<dyn Module>>,
    pub target: ResolvedVc<Box<dyn Module>>,
    pub reference: ResolvedVc<Box<dyn ModuleReference>>,
    pub source_order: u32,
}

/// Namespace format certified for one exact compiler owner.
#[turbo_tasks::task_input]
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Encode, Decode)]
pub enum RuntimeImportNamespaceKind {
    Esm,
    CommonJsCallable,
}

/// A publicly resolved namespace, independent of private execution-part ownership.
#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub struct RuntimeImportNamespaceCertificate {
    pub kind: RuntimeImportNamespaceKind,
    pub module: ResolvedVc<Box<dyn Module>>,
    pub export_order: Vec<RcStr>,
}

#[turbo_tasks::value(shared)]
pub struct RuntimeImportDemandGraph {
    pub edges: Vec<ResolvedVc<RuntimeImportDemandEdge>>,
    pub native_imports: Vec<ResolvedVc<RuntimeImportNativeEdge>>,
    pub namespaces: Vec<ResolvedVc<RuntimeImportNamespaceCertificate>>,
}

impl Deref for RuntimeImportDemandGraph {
    type Target = [ResolvedVc<RuntimeImportDemandEdge>];
    fn deref(&self) -> &Self::Target {
        &self.edges
    }
}

#[turbo_tasks::value_impl]
impl RuntimeImportDemandGraph {
    #[turbo_tasks::function]
    pub async fn owners(&self) -> Result<Vc<Modules>> {
        let mut owners = Vec::new();
        for edge in &self.edges {
            let owner = edge.await?.owner;
            if !owners.contains(&owner) {
                owners.push(owner);
            }
        }
        Ok(Vc::cell(owners))
    }

    #[turbo_tasks::function]
    pub async fn for_owner(&self, owner: ResolvedVc<Box<dyn Module>>) -> Result<Vc<Self>> {
        let mut edges = Vec::new();
        for edge in &self.edges {
            if edge.await?.owner == owner {
                edges.push(*edge);
            }
        }
        let mut namespaces = Vec::new();
        for certificate in &self.namespaces {
            if certificate.await?.module == owner {
                namespaces.push(*certificate);
            }
        }
        let mut native_imports = Vec::new();
        for edge in &self.native_imports {
            if edge.await?.owner == owner {
                native_imports.push(*edge);
            }
        }
        Ok(Self {
            edges,
            native_imports,
            namespaces,
        }
        .cell())
    }
}
