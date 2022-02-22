use turbo_tasks_fs::{FileContent, FileSystemPathRef};

use crate::{
    asset::{AssetRef, AssetsSet, AssetsSetRef},
    ecmascript::references::module_references,
    reference::AssetReferenceRef,
    source_asset::SourceAssetRef,
};

use self::{
    options::{ResolveOptions, ResolveOptionsRef},
    parse::{parse, Request, RequestRef},
};

mod options;
mod parse;

#[turbo_tasks::function]
pub async fn referenced_modules(asset: AssetRef) -> AssetsSetRef {
    let references_set = module_references(asset.clone()).await;
    let mut assets = Vec::new();
    let context = asset.path().parent();
    for reference in references_set.references.iter() {
        let resolve_result = resolve(context.clone(), reference.clone());
        if let ResolveResult::Module(module) = &*resolve_result.await {
            assets.push(module.clone());
        }
    }
    AssetsSet { assets }.into()
}

#[turbo_tasks::value]
#[derive(Hash, PartialEq, Eq, Clone, Debug)]
pub enum ResolveResult {
    Module(AssetRef),
    Unresolveable,
}

#[turbo_tasks::function]
pub async fn resolve(context: FileSystemPathRef, reference: AssetReferenceRef) -> ResolveResultRef {
    let request = reference.await.request.clone();

    let request = RequestRef::value(parse(request));

    let options = ResolveOptionsRef::intern(ResolveOptions {
        extensions: vec![".jsx".to_string(), ".js".to_string()],
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
                        return ResolveResultRef::value(ResolveResult::Module(
                            SourceAssetRef::new(fs_path).into(),
                        ));
                    }
                }
            }

            ResolveResultRef::value(ResolveResult::Unresolveable)
        }
        Request::Module { path: _ } => ResolveResultRef::value(ResolveResult::Unresolveable),
        Request::ServerRelative { path: _ } => {
            ResolveResultRef::value(ResolveResult::Unresolveable)
        }
        Request::Windows { path: _ } => ResolveResultRef::value(ResolveResult::Unresolveable),
        Request::Empty => ResolveResultRef::value(ResolveResult::Unresolveable),
        Request::PackageInternal { path: _ } => {
            ResolveResultRef::value(ResolveResult::Unresolveable)
        }
        Request::DataUri {
            mimetype: _,
            attributes: _,
            base64: _,
            encoded: _,
        } => ResolveResultRef::value(ResolveResult::Unresolveable),
        Request::Uri {
            protocol: _,
            remainer: _,
        } => ResolveResultRef::value(ResolveResult::Unresolveable),
    }
}
