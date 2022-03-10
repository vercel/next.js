use anyhow::{anyhow, Context, Result};
use async_std::task::block_on;
use clap::Parser;
use std::{collections::HashSet, env::current_dir, path::PathBuf};
use turbo_pack::{all_assets, asset::AssetRef, module, source_asset::SourceAssetRef};
use turbo_tasks::{NothingRef, TurboTasks};
use turbo_tasks_fs::{DiskFileSystem, DiskFileSystemRef, FileSystemPathRef, FileSystemRef};

// #[derive(Parser, Debug)]
// #[clap(author, version, about, long_about = None)]
// struct Args {
//     #[clap(subcommand)]
//     command: Command,
// }

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

fn input_to_modules<'a>(
    context: &String,
    input: &'a Vec<String>,
) -> impl Iterator<Item = AssetRef> + 'a {
    let fs: FileSystemRef =
        DiskFileSystemRef::new("context directory".to_string(), context.clone()).into();
    input.iter().map(move |input| {
        let input = FileSystemPathRef::new(fs.clone(), input);
        let source = SourceAssetRef::new(input).into();
        module(source)
    })
}

fn main() {
    match Args::parse() {
        Args::Print {
            input,
            context_directory,
        } => {
            let dir = current_dir().unwrap();
            let mut context = PathBuf::from(context_directory.unwrap_or_else(|| ".".to_string()));
            if !context.is_absolute() {
                context = dir.join(context);
            }
            context = context.canonicalize().unwrap();
            let context = context
                .to_str()
                .ok_or_else(|| anyhow!("context directory contains invalid characters"))
                .unwrap()
                .to_string();
            let input = input
                .into_iter()
                .map(|input| {
                    let mut input = PathBuf::from(input);
                    if !input.is_absolute() {
                        input = dir.join(input);
                    }
                    input = input.canonicalize()?;
                    let input = input.strip_prefix(&context).with_context(|| {
                        anyhow!(
                            "input {} is not part of the context directory {}",
                            input.display(),
                            context
                        )
                    })?;
                    Ok(input
                        .to_str()
                        .ok_or_else(|| anyhow!("input contains invalid characters"))?
                        .replace("\\", "/"))
                })
                .collect::<Result<Vec<_>>>()
                .unwrap();
            println!("{:?}", input);
            let tt = TurboTasks::new();
            tt.spawn_once_task(async move {
                let mut result = HashSet::new();
                for module in input_to_modules(&context, &input) {
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
        } => todo!(),
        Args::Size {
            input,
            context_directory,
        } => todo!(),
    }
}
