use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::Vc;
use turbo_tasks_fs::{DiskFileSystem, DiskWatcherConfig, FileSystem};

#[turbo_tasks::function]
pub async fn project_fs(
    project_dir: RcStr,
    watch: bool,
    denied_root_path: RcStr,
) -> Result<Vc<Box<dyn FileSystem>>> {
    let disk_fs = DiskFileSystem::new_with_options(
        rcstr!("project"),
        Vc::cell(project_dir),
        vec![denied_root_path],
        DiskWatcherConfig::default(),
    );
    if watch {
        disk_fs.await?.start_watching().await?;
    }
    Ok(Vc::upcast(disk_fs))
}

#[turbo_tasks::function]
pub fn output_fs(project_dir: RcStr) -> Result<Vc<Box<dyn FileSystem>>> {
    let disk_fs = DiskFileSystem::new(rcstr!("output"), Vc::cell(project_dir));
    Ok(Vc::upcast(disk_fs))
}
