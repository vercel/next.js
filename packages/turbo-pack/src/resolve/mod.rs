use anyhow::{anyhow, Result};
use json::JsonValue;
use turbo_tasks_fs::{DirectoryContent, FileContent, FileJsonContent, FileSystemPathRef};

use crate::{asset::AssetRef, source_asset::SourceAssetRef};

use self::{
    options::{
        resolve_modules_options, ResolveIntoPackage, ResolveModules, ResolveModulesOptionsRef,
        ResolveOptions, ResolveOptionsRef,
    },
    parse::{Request, RequestRef},
};

pub mod options;
pub mod parse;

#[turbo_tasks::value(shared)]
#[derive(Hash, PartialEq, Eq, Clone, Debug)]
pub enum ResolveResult {
    Module(AssetRef),
    Unresolveable,
}

#[turbo_tasks::function]
pub async fn resolve_options(context: FileSystemPathRef) -> Result<ResolveOptionsRef> {
    let context = context.await?;
    let root = FileSystemPathRef::new(context.fs.clone(), "".to_string());
    Ok(ResolveOptions {
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
    .into())
}

async fn exists(fs_path: FileSystemPathRef) -> Result<bool> {
    Ok(if let FileContent::Content(_) = &*fs_path.read().await? {
        true
    } else {
        false
    })
}

async fn dir_exists(fs_path: FileSystemPathRef) -> Result<bool> {
    Ok(
        if let DirectoryContent::Entries(_) = &*fs_path.read_dir().await? {
            true
        } else {
            false
        },
    )
}

fn join_path(a: &str, b: &str) -> Option<String> {
    if a.is_empty() {
        normalize_path(b)
    } else if b.is_empty() {
        normalize_path(a)
    } else {
        normalize_path(&[a, "/", b].concat())
    }
}

fn normalize_path(str: &str) -> Option<String> {
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
    for seq in seqments.into_iter() {
        if !str.is_empty() && !str.ends_with("/") {
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

#[turbo_tasks::function]
async fn find_package(
    context: FileSystemPathRef,
    package_name: String,
    options: ResolveModulesOptionsRef,
) -> Result<FindPackageResultRef> {
    let options = options.await?;
    for resolve_modules in &options.modules {
        match resolve_modules {
            ResolveModules::Nested(root, names) => {
                let mut context = context.clone();
                let mut context_value = context.get().await?;
                while context_value.is_inside(&*root.get().await?) {
                    for name in names.iter() {
                        if let Some(nested_path) = join_path(&context_value.path, &name) {
                            if let Some(new_path) = join_path(&nested_path, &package_name) {
                                let fs_path =
                                    FileSystemPathRef::new(context_value.fs.clone(), nested_path);
                                if dir_exists(fs_path).await? {
                                    let fs_path =
                                        FileSystemPathRef::new(context_value.fs.clone(), new_path);
                                    if dir_exists(fs_path.clone()).await? {
                                        return Ok(FindPackageResult::Package(fs_path).into());
                                    }
                                }
                            }
                        }
                    }
                    context = context.parent();
                    let new_context_value = context.get().await?;
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
        package_name,
        context.get().await?.path
    );
    Ok(FindPackageResult::NotFound.into())
}

#[turbo_tasks::function]
pub async fn resolve(
    context: FileSystemPathRef,
    request: RequestRef,
    options: ResolveOptionsRef,
) -> Result<ResolveResultRef> {
    Ok(match &*request.get().await? {
        Request::Relative { path } => {
            let options = options.await?;
            let context = context.await?;
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
                    if exists(fs_path.clone()).await? {
                        return Ok(
                            ResolveResult::Module(SourceAssetRef::new(fs_path).into()).into()
                        );
                    }
                }
            }

            ResolveResult::Unresolveable.into()
        }
        Request::Module { module, path } => {
            let package = find_package(
                context,
                module.clone(),
                resolve_modules_options(options.clone()),
            );
            match &*package.await? {
                FindPackageResult::Package(package_path) => {
                    let package_path_value = package_path.get().await?;
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
                    let package_json = package_json.await?;
                    if path.is_empty() {
                        for resolve_into_package in options.get().await?.into_package.iter() {
                            match resolve_into_package {
                                ResolveIntoPackage::Default(req) => {
                                    let request = RequestRef::parse(
                                        "./".to_string() + &normalize_path(&req).ok_or_else(|| anyhow!("ResolveIntoPackage::Default can't be used with a request that escapes the current directory"))?,
                                    );
                                    return Ok(resolve(
                                        package_path.clone(),
                                        request,
                                        options.clone(),
                                    ));
                                }
                                ResolveIntoPackage::MainField(name) => {
                                    if let FileJsonContent::Content(package_json) = &*package_json {
                                        if let JsonValue::String(field_value) = &package_json[name]
                                        {
                                            let request = RequestRef::parse(
                                                "./".to_string()
                                                    + &normalize_path(&field_value).ok_or_else(|| anyhow!("package.json '{}' field contains a request that escapes the package", name))?,
                                            );
                                            return Ok(resolve(
                                                package_path.clone(),
                                                request,
                                                options.clone(),
                                            ));
                                        }
                                    }
                                }
                                ResolveIntoPackage::ExportsField(_) => {
                                    if let FileJsonContent::Content(_package_json) = &*package_json
                                    {
                                        todo!("resolve exports field")
                                    }
                                }
                            }
                        }
                        ResolveResult::Unresolveable.into()
                    } else {
                        for resolve_into_package in options.get().await?.into_package.iter() {
                            match resolve_into_package {
                                ResolveIntoPackage::Default(_)
                                | ResolveIntoPackage::MainField(_) => {
                                    // doesn't affect packages with subpath
                                }
                                ResolveIntoPackage::ExportsField(name) => {
                                    if let FileJsonContent::Content(package_json) = &*package_json {
                                        if let JsonValue::String(_field_value) = &package_json[name]
                                        {
                                            todo!("resolve exports field");
                                            // must return here as other options do not apply anymore
                                            // return ResolveResult::Unresolveable.into();
                                        }
                                    }
                                }
                            }
                        }
                        if let Some(path) = normalize_path(&path) {
                            let request = RequestRef::parse(format!("./{}", path));
                            return Ok(resolve(package_path.clone(), request, options.clone()));
                        }
                        ResolveResult::Unresolveable.into()
                    }
                }
                FindPackageResult::NotFound => ResolveResult::Unresolveable.into(),
            }
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
    })
}
