use swc_ecmascript::ast::{ModuleDecl, ModuleItem};

use crate::{
    module::ModuleRef,
    reference::{ModuleReferenceRef, ModuleReferencesSet, ModuleReferencesSetRef},
};

use super::parse::{parse, ParseResult};

#[turbo_tasks::function]
pub async fn module_references(module: ModuleRef) -> ModuleReferencesSetRef {
    let parsed = parse(module).await;
    match &*parsed {
        ParseResult::Ok(module) => {
            let mut references = Vec::new();
            for item in module.body.iter() {
                if let ModuleItem::ModuleDecl(ModuleDecl::Import(decl)) = item {
                    references.push(ModuleReferenceRef::new(decl.src.value.to_string()));
                }
            }
            ModuleReferencesSet { references }.into()
        }
        ParseResult::Unparseable | ParseResult::NotFound => ModuleReferencesSetRef::empty(),
    }
}
