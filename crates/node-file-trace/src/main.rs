use anyhow::{anyhow, Context, Result};
use async_std::task::{block_on, spawn};
use clap::Parser;
use std::{
    collections::BTreeSet, env::current_dir, future::Future, path::PathBuf, pin::Pin, time::Instant,
};
use turbo_tasks::{NothingRef, TurboTasks};
use turbo_tasks_fs::{
    glob::GlobRef, DirectoryContent, DirectoryEntry, DiskFileSystemRef, FileSystemPathRef,
    FileSystemRef, ReadGlobResultRef,
};
use turbopack::{
    all_assets, asset::AssetRef, emit, module, rebase::RebasedAssetRef,
    source_asset::SourceAssetRef,
};

#[derive(Parser, Debug)]
#[clap(author, version, about, long_about = None)]
enum Args {
    // Print all files that the input files reference
    Print {
        input: Vec<String>,

        #[clap(short, long)]
        context_directory: Option<String>,
    },

    // Adds a *.nft.json file next to each input file which lists the referenced files
    Annotate {
        input: Vec<String>,

        #[clap(short, long)]
        context_directory: Option<String>,
    },

    // Copy input files and all referenced files to the output directory
    Build {
        input: Vec<String>,

        #[clap(short, long)]
        context_directory: Option<String>,

        #[clap(short, long, default_value_t = String::from("dist"))]
        output_directory: String,
    },

    // Copy input files and all referenced files to the output directory as long as the process is running
    Watch {
        input: Vec<String>,

        #[clap(short, long)]
        context_directory: Option<String>,

        #[clap(short, long, default_value_t = String::from("dist"))]
        output_directory: String,
    },

    // Print total size of input and referenced files
    Size {
        input: Vec<String>,

        #[clap(short, long)]
        context_directory: Option<String>,
    },
}

fn create_fs(context: &str) -> FileSystemRef {
    DiskFileSystemRef::new("context directory".to_string(), context.to_string()).into()
}

async fn add_glob_results(result: ReadGlobResultRef, list: &mut Vec<AssetRef>) -> Result<()> {
    let result = result.await?;
    let more = result
        .expandable
        .values()
        .map(|cont| cont.clone().read_glob());
    for entry in result.results.values() {
        match entry {
            DirectoryEntry::File(path) => {
                let source = SourceAssetRef::new(path.clone()).into();
                list.push(module(source));
            }
            _ => {}
        }
    }
    for result in more {
        fn recurse<'a>(
            result: ReadGlobResultRef,
            list: &'a mut Vec<AssetRef>,
        ) -> Pin<Box<dyn Future<Output = Result<()>> + Send + 'a>> {
            Box::pin(add_glob_results(result, list))
        }
        // Boxing for async recursion
        recurse(result, list).await?;
    }
    Ok(())
}

async fn input_to_modules<'a>(
    fs: &'a FileSystemRef,
    input: &'a Vec<String>,
) -> Result<Vec<AssetRef>> {
    let root = FileSystemPathRef::new(fs.clone(), "");
    let mut list = Vec::new();
    for input in input.iter() {
        let glob = GlobRef::new(input);
        add_glob_results(root.clone().read_glob(glob, false), &mut list).await?;
    }
    Ok(list)
}

fn process_context(dir: &PathBuf, context_directory: Option<String>) -> Result<String> {
    let mut context = PathBuf::from(context_directory.unwrap_or_else(|| ".".to_string()));
    if !context.is_absolute() {
        context = dir.join(context);
    }
    // context = context.canonicalize().unwrap();
    Ok(context
        .to_str()
        .ok_or_else(|| anyhow!("context directory contains invalid characters"))
        .unwrap()
        .to_string())
}

fn make_relative_path(dir: &PathBuf, context: &str, input: &str) -> Result<String> {
    let mut input = PathBuf::from(input);
    if !input.is_absolute() {
        input = dir.join(input);
    }
    // input = input.canonicalize()?;
    let input = input.strip_prefix(&context).with_context(|| {
        anyhow!(
            "{} is not part of the context directory {}",
            input.display(),
            context
        )
    })?;
    Ok(input
        .to_str()
        .ok_or_else(|| anyhow!("input contains invalid characters"))?
        .replace("\\", "/"))
}

fn process_input(dir: &PathBuf, context: &String, input: Vec<String>) -> Result<Vec<String>> {
    input
        .into_iter()
        .map(|input| make_relative_path(dir, context, &input))
        .collect()
}

fn main() {
    match Args::parse() {
        Args::Print {
            input,
            context_directory,
        } => {
            let start = Instant::now();
            let dir = current_dir().unwrap();
            let context = process_context(&dir, context_directory).unwrap();
            let input = process_input(&dir, &context, input).unwrap();
            let tt = TurboTasks::new();
            tt.spawn_once_task(async move {
                let mut result = BTreeSet::new();
                let fs = create_fs(&context);
                let modules = input_to_modules(&fs, &input).await?;
                for module in modules {
                    let set = all_assets(module);
                    for asset in set.await?.assets.iter() {
                        let path = asset.path().await?;
                        result.insert(path.path.to_string());
                    }
                }
                for path in result {
                    println!("{}", path);
                }
                Ok(NothingRef::new().into())
            });
            block_on(tt.wait_done());
            println!("done in {} ms", start.elapsed().as_millis());
        }
        Args::Annotate {
            input,
            context_directory,
        } => todo!(),
        Args::Build {
            input,
            context_directory,
            output_directory,
        } => todo!(),
        Args::Watch {
            input,
            context_directory,
            output_directory,
        } => {
            let start = Instant::now();
            let tt = TurboTasks::new();

            let handle = spawn({
                let tt = tt.clone();
                async move {
                    tt.wait_done().await;
                    println!("done in {} ms", start.elapsed().as_millis());

                    loop {
                        let (elapsed, count) = tt.wait_done().await;
                        if elapsed.as_millis() >= 10 {
                            println!("updated {} tasks in {} ms", count, elapsed.as_millis());
                        } else {
                            println!("updated {} tasks in {} µs", count, elapsed.as_micros());
                        }
                    }
                }
            });

            let dir = current_dir().unwrap();
            let context = process_context(&dir, context_directory).unwrap();
            let output = process_context(&dir, Some(output_directory)).unwrap();
            let input = process_input(&dir, &context, input).unwrap();
            tt.spawn_once_task(async move {
                let fs = create_fs(&context);
                let out_fs = create_fs(&output);
                let input_dir = FileSystemPathRef::new(fs.clone(), "");
                let output_dir = FileSystemPathRef::new(out_fs, "");
                for module in input_to_modules(&fs, &input).await? {
                    let rebased =
                        RebasedAssetRef::new(module, input_dir.clone(), output_dir.clone()).into();
                    emit(rebased);
                }
                Ok(NothingRef::new().into())
            });

            block_on(handle);
        }
        Args::Size {
            input,
            context_directory,
        } => todo!(),
    }
}
