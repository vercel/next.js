use turbo_tasks_fs::{DirectoryContent, FileContent, FileJsonContent, FileSystemPathRef};

use crate::{
    asset::{AssetRef, AssetsSet, AssetsSetRef},
    ecmascript::references::module_references,
    reference::AssetReferenceRef,
    source_asset::SourceAssetRef,
};

use self::{
    options::{
        resolve_modules_options, ResolveIntoPackage, ResolveModules, ResolveModulesOptionsRef,
        ResolveOptions, ResolveOptionsRef,
    },
    parse::{Request, RequestRef},
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

#[turbo_tasks::value(shared)]
#[derive(Hash, PartialEq, Eq, Clone, Debug)]
pub enum ResolveResult {
    Module(AssetRef),
    Unresolveable,
}

#[turbo_tasks::function]
pub async fn resolve_options(context: FileSystemPathRef) -> ResolveOptionsRef {
    let context = context.await;
    let root = FileSystemPathRef::new(context.fs.clone(), "".to_string());
    ResolveOptions {
        extensions: vec![".jsx".to_string(), ".js".to_string()],
        modules: vec![ResolveModules::Nested(
            root,
            vec!["node_modules".to_string()],
        )],
        into_package: vec![
            ResolveIntoPackage::MainField("main".to_string()),
            ResolveIntoPackage::Default("index".to_string()),
        ],
    }
    .into()
}

#[turbo_tasks::function]
pub async fn resolve(context: FileSystemPathRef, reference: AssetReferenceRef) -> ResolveResultRef {
    let input_request = reference.await.request.clone();

    let request = RequestRef::parse(input_request);

    let options = resolve_options(context.clone());

    let result = resolve_internal(context, request, options)
        .resolve_to_value()
        .await;

    result
}

async fn exists(fs_path: FileSystemPathRef) -> bool {
    if let FileContent::Content(_) = &*fs_path.read().await {
        true
    } else {
        false
    }
}

async fn dir_exists(fs_path: FileSystemPathRef) -> bool {
    if let DirectoryContent::Entries(_) = &*fs_path.read_dir().await {
        true
    } else {
        false
    }
}

fn join_path(a: &str, b: &str) -> Option<String> {
    if a.is_empty() {
        normalize_path(b.to_string())
    } else if b.is_empty() {
        normalize_path(a.to_string())
    } else {
        normalize_path([a, "/", b].concat())
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

#[turbo_tasks::value(shared)]
#[derive(PartialEq, Eq)]
enum FindPackageResult {
    Package(FileSystemPathRef),
    NotFound,
}

#[turbo_tasks::value(intern)]
#[derive(Hash, PartialEq, Eq)]
struct PackageName {
    name: String,
}

#[turbo_tasks::function]
async fn find_package(
    context: FileSystemPathRef,
    name: PackageNameRef,
    options: ResolveModulesOptionsRef,
) -> FindPackageResultRef {
    let package_name = name.await;
    let options = options.await;
    for resolve_modules in &options.modules {
        match resolve_modules {
            ResolveModules::Nested(root, names) => {
                let mut context = context.clone();
                let mut context_value = context.get().await;
                while context_value.is_inside(&*root.get().await) {
                    for name in names.iter() {
                        if let Some(nested_path) = join_path(&context_value.path, &name) {
                            if let Some(new_path) = join_path(&nested_path, &package_name.name) {
                                let fs_path =
                                    FileSystemPathRef::new(context_value.fs.clone(), nested_path);
                                if dir_exists(fs_path).await {
                                    let fs_path =
                                        FileSystemPathRef::new(context_value.fs.clone(), new_path);
                                    if dir_exists(fs_path.clone()).await {
                                        return FindPackageResult::Package(fs_path).into();
                                    }
                                }
                            }
                        }
                    }
                    context = context.parent();
                    let new_context_value = context.get().await;
                    if *new_context_value == *context_value {
                        break;
                    }
                    context_value = new_context_value;
                }
            }
            ResolveModules::Path(_) => todo!(),
            ResolveModules::Registry(_, _) => todo!(),
        }
    }
    println!(
        "unable to find package {} in {}",
        package_name.name,
        context.get().await.path
    );
    FindPackageResult::NotFound.into()
}

#[turbo_tasks::function]
async fn resolve_internal(
    context: FileSystemPathRef,
    request: RequestRef,
    options: ResolveOptionsRef,
) -> ResolveResultRef {
    match &*request.get().await {
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
                if let Some(new_path) = join_path(&context.path, &req) {
                    let fs_path = FileSystemPathRef::new(context.fs.clone(), new_path);
                    if exists(fs_path.clone()).await {
                        return ResolveResult::Module(SourceAssetRef::new(fs_path).into()).into();
                    }
                }
            }

            ResolveResult::Unresolveable.into()
        }
        Request::Module { module, path } => {
            let package = find_package(
                context,
                PackageName {
                    name: module.clone(),
                }
                .into(),
                resolve_modules_options(options.clone()),
            );
            match &*package.await {
                FindPackageResult::Package(package_path) => {
                    let package_path_value = package_path.get().await;
                    let package_json = {
                        if let Some(new_path) = join_path(&package_path_value.path, "package.json")
                        {
                            let fs_path =
                                FileSystemPathRef::new(package_path_value.fs.clone(), new_path);
                            fs_path.read_json()
                        } else {
                            FileJsonContent::NotFound.into()
                        }
                    };
                    if path.is_empty() {
                        if let FileJsonContent::Content(package_json) = &*package_json.await {
                            for resolve_into_package in options.get().await.into_package.iter() {
                                match resolve_into_package {
                                    ResolveIntoPackage::Default(req) => {
                                        let request = RequestRef::parse(
                                            "./".to_string()
                                                + &normalize_path(req.clone()).unwrap(),
                                        );
                                        return resolve_internal(
                                            package_path.clone(),
                                            request,
                                            options.clone(),
                                        );
                                    }
                                    ResolveIntoPackage::MainField(_) => todo!("resolve main field"),
                                    ResolveIntoPackage::ExportsField(_) => {
                                        todo!("resolve exports field")
                                    }
                                }
                            }
                            ResolveResult::Unresolveable.into()
                        } else {
                            for resolve_into_package in options.get().await.into_package.iter() {
                                match resolve_into_package {
                                    ResolveIntoPackage::Default(req) => {
                                        let request = RequestRef::parse(
                                            "./".to_string()
                                                + &normalize_path(req.clone()).unwrap(),
                                        );
                                        return resolve_internal(
                                            package_path.clone(),
                                            request,
                                            options.clone(),
                                        );
                                    }
                                    ResolveIntoPackage::MainField(_)
                                    | ResolveIntoPackage::ExportsField(_) => {
                                        // ignore fields as there is no package.json
                                    }
                                }
                            }
                            ResolveResult::Unresolveable.into()
                        }
                    } else {
                        ResolveResult::Unresolveable.into()
                    }
                }
                FindPackageResult::NotFound => ResolveResult::Unresolveable.into(),
            }
            // let options = options.await;
            // let context = context.get().await;
            // for resolve_modules in &options.modules {
            //     match resolve_modules {
            //         ResolveModules::Nested(root, names) => {
            //             if context.is_inside(&*root.get().await) {
            //                 for name in names.iter() {
            //                     if let Some(nested_path) =
            //                         normalize_path(context.path.clone() + "/" + &name)
            //                     {
            //                         let fs_path =
            //                             FileSystemPathRef::new(context.fs.clone(), nested_path);
            //                         if dir_exists(fs_path).await {
            //                             if let Some(new_path) =
            //                                 normalize_path(nested_path + "/" + &module)
            //                             {
            //                                 if dir_exists(fs_path).await {}
            //                             }
            //                         }
            //                     }
            //                 }
            //             }
            //         }
            //         ResolveModules::Path(_) => todo!(),
            //         ResolveModules::Registry(_, _) => todo!(),
            //     }
            // }
            // return ResolveResult::Unresolveable.into();
        }
        Request::ServerRelative { path: _ } => ResolveResult::Unresolveable.into(),
        Request::Windows { path: _ } => ResolveResult::Unresolveable.into(),
        Request::Empty => ResolveResult::Unresolveable.into(),
        Request::PackageInternal { path: _ } => ResolveResult::Unresolveable.into(),
        Request::DataUri {
            mimetype: _,
            attributes: _,
            base64: _,
            encoded: _,
        } => ResolveResult::Unresolveable.into(),
        Request::Uri {
            protocol: _,
            remainer: _,
        } => ResolveResult::Unresolveable.into(),
        Request::Unknown { path: _ } => ResolveResult::Unresolveable.into(),
    }
}
