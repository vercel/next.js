use std::path::PathBuf;

use anyhow::Result;
use clap::Parser;
use turbopack_create_test_app::test_app_builder::TestAppBuilder;

#[derive(Parser, Debug)]
#[clap(author, version, about, long_about = None)]
struct Args {
    /// The directory in which to create the test app.
    #[clap(value_name = "DIR", value_parser, default_value = ".")]
    target: PathBuf,

    /// The number of modules to generate
    #[clap(short, long, value_parser, default_value_t = 1000)]
    modules: usize,

    /// The number of directories to generate
    #[clap(short, long, value_parser, default_value_t = 50)]
    directories: usize,

    /// The number of dynamic imports (import()) to generate
    #[clap(long, value_parser, default_value_t = 0)]
    dynamic_imports: usize,

    /// How flat should be the component tree
    #[clap(short, long, value_parser, default_value_t = 4)]
    flatness: usize,

    /// Generate a package.json with required dependencies
    #[clap(long)]
    package_json: bool,
}

fn main() -> Result<()> {
    let args = Args::parse();

    println!(
        "{}",
        TestAppBuilder {
            target: Some(args.target),
            module_count: args.modules,
            directories_count: args.directories,
            dynamic_import_count: args.dynamic_imports,
            flatness: args.flatness,
            package_json: if args.package_json {
                Some(Default::default())
            } else {
                None
            }
        }
        .build()?
        .path()
        .display()
    );

    Ok(())
}
