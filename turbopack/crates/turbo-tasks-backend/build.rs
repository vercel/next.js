use anyhow::Result;
use turbo_tasks_build::generate_register;
use vergen_gitcl::{Emitter, GitclBuilder};

fn generate_version_info() -> Result<()> {
    let git = GitclBuilder::default()
        .describe(false, option_env!("CI").is_none(), None)
        .build()?;
    Emitter::default().add_instructions(&git)?.emit()?;
    Ok(())
}

fn main() {
    generate_register();
    generate_version_info().unwrap();
}
