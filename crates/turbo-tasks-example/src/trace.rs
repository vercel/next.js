use crate::utils::race_pop;
use anyhow::Result;
use std::collections::HashSet;
use std::future::IntoFuture;
use turbo_tasks_fs::{rebase, FileContent, FileContentRef, FileSystemPath, FileSystemPathRef};

#[turbo_tasks::value]
#[derive(PartialEq, Eq)]
pub struct CopyAllOptions {
    pub input_dir: FileSystemPathRef,
    pub output_dir: FileSystemPathRef,
}

#[turbo_tasks::function]
pub async fn copy_all(input: FileSystemPathRef, options: CopyAllOptionsRef) -> Result<()> {
    let entry = module(input);
    let modules = all_modules(entry);

    for module in modules.get().await?.modules.iter() {
        copy_module(module.clone(), options.clone());
    }
    Ok(())
}

#[turbo_tasks::function]
async fn copy_module(module: ModuleRef, options: CopyAllOptionsRef) -> Result<()> {
    let resource = &module.await?.resource;
    let content = resource.clone().read();
    let options_value = options.await?;
    let output = rebase(
        resource.clone(),
        options_value.input_dir.clone(),
        options_value.output_dir.clone(),
    );
    output.write(content);
    Ok(())
}

#[turbo_tasks::function]
async fn module(fs_path: FileSystemPathRef) -> ModuleRef {
    let source = fs_path.clone().read();
    let content = parse(source);
    Module {
        resource: fs_path,
        content,
    }
    .into()
}

#[turbo_tasks::value(shared)]
#[derive(PartialEq, Eq)]
struct Module {
    resource: FileSystemPathRef,
    content: ModuleContentRef,
}

#[turbo_tasks::value(shared)]
#[derive(PartialEq, Eq)]
struct ModuleContent {
    items: Vec<ModuleItemRef>,
}

#[turbo_tasks::value(shared)]
#[derive(PartialEq, Eq)]
enum ModuleItem {
    Comment(String),
    Reference(AssetReferenceRef),
}

#[turbo_tasks::value(shared)]
#[derive(PartialEq, Eq)]
struct AssetReference {
    request: String,
}

#[turbo_tasks::function]
async fn parse(content: FileContentRef) -> Result<ModuleContentRef> {
    Ok(match &*content.await? {
        FileContent::Content(bytes) => {
            let content = &*String::from_utf8_lossy(&bytes);
            let items: Vec<ModuleItemRef> = content
                .lines()
                .into_iter()
                .map(|line| {
                    if line.starts_with("#") {
                        ModuleItem::Comment(line[1..].to_string()).into()
                    } else {
                        ModuleItem::Reference(
                            AssetReference {
                                request: line.to_string(),
                            }
                            .into(),
                        )
                        .into()
                    }
                })
                .collect();
            ModuleContent { items }.into()
        }
        FileContent::NotFound => {
            // report error
            ModuleContent { items: Vec::new() }.into()
        }
    })
}

#[turbo_tasks::value(shared)]
#[derive(PartialEq, Eq)]
struct ModulesSet {
    modules: HashSet<ModuleRef>,
}

#[turbo_tasks::function]
async fn all_modules(module: ModuleRef) -> Result<ModulesSetRef> {
    let mut modules = HashSet::new();
    let mut queue = vec![module];
    let mut futures_queue = Vec::new();
    loop {
        match queue.pop() {
            Some(module) => {
                modules.insert(module.clone());
                futures_queue.push(Box::pin(referenced_modules(module).into_future()));
            }
            None => match race_pop(&mut futures_queue).await {
                Some(modules_set_result) => {
                    for module in modules_set_result?.modules.iter() {
                        queue.push(module.clone());
                    }
                }
                None => break,
            },
        }
    }
    assert!(futures_queue.is_empty());
    Ok(ModulesSet { modules }.into())
}

#[turbo_tasks::function]
async fn referenced_modules(origin: ModuleRef) -> Result<ModulesSetRef> {
    let mut modules = HashSet::new();
    for item in origin.get().await?.content.get().await?.items.iter() {
        match &*item.get().await? {
            ModuleItem::Comment(_) => {}
            ModuleItem::Reference(reference) => {
                let resolved = referenced_module(origin.clone(), reference.clone());
                modules.insert(resolved);
            }
        }
    }
    Ok(ModulesSet { modules }.into())
}

#[turbo_tasks::function]
async fn referenced_module(origin: ModuleRef, reference: AssetReferenceRef) -> Result<ModuleRef> {
    let resolved = resolve(origin.await?.resource.clone(), reference.clone());
    Ok(module(resolved))
}

#[turbo_tasks::function]
async fn resolve(
    origin: FileSystemPathRef,
    reference: AssetReferenceRef,
) -> Result<FileSystemPathRef> {
    let FileSystemPath { fs, path } = &*origin.await?;
    let mut request = reference.await?.request.to_string();
    let mut p = path.to_string();
    match p.rfind(|c| c == '/' || c == '\\') {
        Some(pos) => p.replace_range(pos.., ""),
        None => {}
    }
    loop {
        if request.starts_with("../") {
            request.replace_range(0..=2, "");
            match p.rfind(|c| c == '/' || c == '\\') {
                Some(pos) => p.replace_range(pos.., ""),
                None => {}
            }
        } else if request.starts_with("./") {
            request.replace_range(0..=1, "");
        } else {
            break;
        }
    }
    Ok(FileSystemPathRef::new(fs.clone(), &(p + "/" + &request)))
}
