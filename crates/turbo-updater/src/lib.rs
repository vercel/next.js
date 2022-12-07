use std::time::Duration;

use colored::*;
use serde::Deserialize;
use thiserror::Error as ThisError;
use update_informer::{Check, Package, Registry, Result as UpdateResult};

mod ui;

const DEFAULT_TIMEOUT: Duration = Duration::from_millis(800);
const DEFAULT_INTERVAL: Duration = Duration::from_secs(60 * 60 * 24);

#[derive(ThisError, Debug)]
pub enum UpdateNotifierError {
    #[error("Failed to write to terminal")]
    RenderError(#[from] ui::utils::GetDisplayLengthError),
}

#[derive(Deserialize)]
struct NpmVersionData {
    version: String,
}

struct NPMRegistry;

impl Registry for NPMRegistry {
    const NAME: &'static str = "npm_registry";
    fn get_latest_version(pkg: &Package, _timeout: Duration) -> UpdateResult<Option<String>> {
        let url = format!(
            "https://turbo.build/api/binaries/version?name={name}",
            name = pkg
        );
        let resp = ureq::get(&url).timeout(_timeout).call()?;
        let result = resp.into_json::<NpmVersionData>().unwrap();
        Ok(Some(result.version))
    }
}

pub fn check_for_updates(
    package_name: &str,
    github_repo: &str,
    footer: Option<&str>,
    current_version: &str,
    timeout: Option<Duration>,
    interval: Option<Duration>,
) -> Result<(), UpdateNotifierError> {
    let timeout = timeout.unwrap_or(DEFAULT_TIMEOUT);
    let interval = interval.unwrap_or(DEFAULT_INTERVAL);
    let informer = update_informer::new(NPMRegistry, package_name, current_version)
        .timeout(timeout)
        .interval(interval);
    if let Ok(Some(version)) = informer.check_version() {
        let latest_version = version.to_string();
        let msg = format!(
            "
            Update available {version_prefix}{current_version} ≫ {latest_version}
            Changelog: {github_repo}/releases/tag/{latest_version}
            Run \"{update_cmd}\" to update
            ",
            version_prefix = "v".dimmed(),
            current_version = current_version.dimmed(),
            latest_version = latest_version.green().bold(),
            github_repo = github_repo,
            // TODO: make this package manager aware
            update_cmd = "npm i -g turbo".cyan().bold(),
        );

        if let Some(footer) = footer {
            return ui::message(&format!("{}\n{}", msg, footer));
        }

        return ui::message(&msg);
    }

    Ok(())
}
