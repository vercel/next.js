use turbo_tasks_fs::{FileContent, FileSystemPathRef};

use crate::{
    ecmascript::references::module_references,
    module::{Module, ModuleRef, ModulesSet, ModulesSetRef},
    reference::ModuleReferenceRef,
};

#[turbo_tasks::function]
pub async fn referenced_modules(module: ModuleRef) -> ModulesSetRef {
    let references_set = module_references(module.clone()).await.await;
    let mut modules = Vec::new();
    let context = module.await.path.clone().parent().await;
    for reference in references_set.references.iter() {
        let resolve_result = resolve(context.clone(), reference.clone()).await;
        if let ResolveResult::Module(module) = &*resolve_result.await {
            modules.push(module.clone());
        }
    }
    ModulesSet { modules }.into()
}

#[turbo_tasks::value]
#[derive(Hash, PartialEq, Eq, Clone, Debug)]
pub enum ResolveResult {
    Module(ModuleRef),
    Unresolveable,
}

#[turbo_tasks::function]
pub async fn resolve(
    context: FileSystemPathRef,
    reference: ModuleReferenceRef,
) -> ResolveResultRef {
    let path = context.await;
    let mut request = reference.await.request.clone();

    if request.starts_with("./") {
        request.replace_range(0..1, "");

        let possible_path = FileSystemPathRef::new(path.fs.clone(), path.path.clone() + &request);
        if let FileContent::Content(_) = &*possible_path.clone().read().await.await {
            return ResolveResult::Module(ModuleRef::intern(Module {
                path: possible_path,
            }))
            .into();
        }

        let possible_path =
            FileSystemPathRef::new(path.fs.clone(), path.path.clone() + &request + ".js");
        if let FileContent::Content(_) = &*possible_path.clone().read().await.await {
            return ResolveResult::Module(ModuleRef::intern(Module {
                path: possible_path,
            }))
            .into();
        }
    }

    ResolveResultRef::value(ResolveResult::Unresolveable)
}
