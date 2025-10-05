use anyhow::Error;
use rustc_hash::FxHashSet;
use swc_core::ecma::{
    ast::{Module, ModuleDecl, ModuleItem},
    atoms::Atom,
};

use super::{PartId, graph::find_turbopack_part_id_in_asserts};

/// A loader used to merge module items after splitting.
pub trait Load {
    /// Loads a module while returning [None] if the module is already loaded.
    fn load(&mut self, uri: &str, part_id: u32) -> Result<Option<Module>, Error>;
}

/// A module merger.
///
/// This ensures that a module is loaded only once.
pub struct Merger<L>
where
    L: Load,
{
    loader: L,

    done: FxHashSet<(Atom, u32)>,
}

impl<L> Merger<L>
where
    L: Load,
{
    /// Creates a module merger.
    pub fn new(loader: L) -> Self {
        Merger {
            loader,
            done: Default::default(),
        }
    }

    /// Merges module content by appending the content of imported modules. This
    /// is recursive, so a single call is enough.
    pub fn merge_recursively(&mut self, entry: Module) -> Result<Module, Error> {
        let mut content = vec![];
        let mut extra_body = vec![];

        for stmt in entry.body {
            match stmt {
                ModuleItem::ModuleDecl(ModuleDecl::Import(import)) => {
                    // Try to prepend the content of module

                    let part_id = import
                        .with
                        .as_deref()
                        .and_then(find_turbopack_part_id_in_asserts);

                    if let Some(PartId::Internal(part_id, _)) = part_id {
                        if self.done.insert((import.src.value.clone(), part_id)) {
                            if let Some(dep) = self.loader.load(&import.src.value, part_id)? {
                                let mut dep = self.merge_recursively(dep)?;

                                extra_body.append(&mut dep.body);
                            } else {
                                content.push(ModuleItem::ModuleDecl(ModuleDecl::Import(import)));
                            }
                        } else {
                            // Remove import
                        }
                    } else {
                        // Preserve normal imports
                        content.push(ModuleItem::ModuleDecl(ModuleDecl::Import(import)));
                    }
                }
                _ => extra_body.push(stmt),
            }
        }

        content.append(&mut extra_body);

        Ok(Module {
            span: entry.span,
            body: content,
            shebang: entry.shebang,
        })
    }
}
