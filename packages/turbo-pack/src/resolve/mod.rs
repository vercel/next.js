use turbo_tasks_fs::{FileContent, FileSystemPathRef};

use crate::{
    ecmascript::references::module_references,
    module::{module, ModuleRef, ModulesSet, ModulesSetRef},
    reference::ModuleReferenceRef,
};

use self::{
    options::{ResolveOptions, ResolveOptionsRef},
    parse::{parse, Request, RequestRef},
};

mod options;
mod parse;

#[turbo_tasks::function]
pub async fn referenced_modules(module: ModuleRef) -> ModulesSetRef {
    let references_set = module_references(module.clone()).await;
    let mut modules = Vec::new();
    let context = module.await.path.clone().parent();
    for reference in references_set.references.iter() {
        let resolve_result = resolve(context.clone(), reference.clone());
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
    let request = reference.await.request.clone();

    let request = RequestRef::value(parse(request));

    let options = ResolveOptionsRef::intern(ResolveOptions {
        extensions: vec![".js".to_string()],
        modules: vec![],
    });

    resolve_internal(context, request, options)
        .resolve_to_value()
        .await
}

async fn exists(fs_path: FileSystemPathRef) -> bool {
    if let FileContent::Content(_) = &*fs_path.read().await {
        true
    } else {
        false
    }
}

fn normalize_path(str: String) -> Option<String> {
    let mut seqments = Vec::new();
    for seqment in str.split('/') {
        match seqment {
            "." => {}
            ".." => {
                if seqments.pop().is_none() {
                    return None;
                }
            }
            seqment => {
                seqments.push(seqment);
            }
        }
    }
    let mut str = String::new();
    for (i, seq) in seqments.into_iter().enumerate() {
        if i > 0 {
            str += "/";
        }
        str += seq;
    }
    Some(str)
}

#[turbo_tasks::function]
async fn resolve_internal(
    context: FileSystemPathRef,
    request: RequestRef,
    options: ResolveOptionsRef,
) -> ResolveResultRef {
    match &*request.await {
        Request::Relative { path } => {
            let options = options.await;
            let context = context.await;
            let mut possible_requests = Vec::new();
            possible_requests.push(path.to_string());
            for ext in options.extensions.iter() {
                possible_requests.push(path.to_string() + ext);
            }
            possible_requests.push(path.to_string() + "/index");
            for ext in options.extensions.iter() {
                possible_requests.push(path.to_string() + "/index" + ext);
            }

            for req in possible_requests {
                if let Some(new_path) = normalize_path(context.path.clone() + "/" + &req) {
                    let fs_path = FileSystemPathRef::new(context.fs.clone(), new_path);
                    if exists(fs_path.clone()).await {
                        return ResolveResultRef::value(ResolveResult::Module(module(fs_path)));
                    }
                }
            }

            ResolveResultRef::value(ResolveResult::Unresolveable)
        }
        Request::Module { path } => ResolveResultRef::value(ResolveResult::Unresolveable),
        Request::ServerRelative { path } => ResolveResultRef::value(ResolveResult::Unresolveable),
        Request::Windows { path } => ResolveResultRef::value(ResolveResult::Unresolveable),
        Request::Empty => ResolveResultRef::value(ResolveResult::Unresolveable),
        Request::PackageInternal { path } => ResolveResultRef::value(ResolveResult::Unresolveable),
        Request::DataUri {
            mimetype,
            attributes,
            base64,
            encoded,
        } => ResolveResultRef::value(ResolveResult::Unresolveable),
        Request::Uri { protocol, remainer } => {
            ResolveResultRef::value(ResolveResult::Unresolveable)
        }
    }
}
