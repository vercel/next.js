use std::{fmt, time::Duration};

use colored::*;
use is_terminal::IsTerminal;
use semver::Version as SemVerVersion;
use serde::Deserialize;
use thiserror::Error as ThisError;
use update_informer::{Check, Package, Registry, Result as UpdateResult, Version};

mod ui;

// 800ms
const DEFAULT_TIMEOUT: Duration = Duration::from_millis(800);
// 1 day
const DEFAULT_INTERVAL: Duration = Duration::from_secs(60 * 60 * 24);

const NOTIFIER_DISABLE_VARS: [&str; 2] = ["NO_UPDATE_NOTIFIER", "TURBO_NO_UPDATE_NOTIFIER"];
const ENVIRONMENTAL_DISABLE_VARS: [&str; 1] = ["CI"];

#[derive(ThisError, Debug)]
pub enum UpdateNotifierError {
    #[error("Failed to write to terminal")]
    RenderError(#[from] ui::utils::GetDisplayLengthError),
    #[error("Failed to parse current version")]
    VersionError(#[from] semver::Error),
}

#[derive(Deserialize, Debug)]
struct NpmVersionData {
    version: String,
}

#[derive(Debug)]
enum VersionTag {
    Latest,
    Canary,
}

impl fmt::Display for VersionTag {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            VersionTag::Latest => write!(f, "latest"),
            VersionTag::Canary => write!(f, "canary"),
        }
    }
}

struct NPMRegistry;

impl Registry for NPMRegistry {
    const NAME: &'static str = "npm-registry";
    fn get_latest_version(
        pkg: &Package,
        version: &Version,
        timeout: Duration,
    ) -> UpdateResult<Option<String>> {
        // determine tag to request
        let tag = get_tag_from_version(&version.get().pre);
        // since we're overloading tag within name, we need to split it back out
        let full_name = pkg.to_string();
        let split_name: Vec<&str> = full_name.split('/').collect();
        let name = split_name[1];
        let url = format!(
            "https://turbo.build/api/binaries/version?name={name}&tag={tag}",
            name = name,
            tag = tag
        );
        let resp = ureq::get(&url).timeout(timeout).call()?;
        let result = resp.into_json::<NpmVersionData>().unwrap();
        Ok(Some(result.version))
    }
}

fn get_tag_from_version(pre: &semver::Prerelease) -> VersionTag {
    match pre {
        t if t.contains("canary") => VersionTag::Canary,
        _ => VersionTag::Latest,
    }
}

fn should_skip_notification() -> bool {
    if NOTIFIER_DISABLE_VARS
        .iter()
        .any(|var| std::env::var(var).is_ok())
    {
        return true;
    }

    if ENVIRONMENTAL_DISABLE_VARS
        .iter()
        .any(|var| std::env::var(var).is_ok())
    {
        return true;
    }

    if !std::io::stdout().is_terminal() {
        return true;
    }

    false
}

pub fn check_for_updates(
    package_name: &str,
    github_repo: &str,
    footer: Option<&str>,
    current_version: &str,
    timeout: Option<Duration>,
    interval: Option<Duration>,
) -> Result<(), UpdateNotifierError> {
    // bail early if the user has disabled update notifications
    if should_skip_notification() {
        return Ok(());
    }

    // we want notifications per channel (latest, canary, etc) so we need to ensure
    // we have one cached latest version per channel. UpdateInformer does not
    // support this out of the box, so we hack it into the name by overloading
    // owner (in the supported owner/name format) to be channel/name.
    let parsed_version = SemVerVersion::parse(current_version)?;
    let tag = get_tag_from_version(&parsed_version.pre);
    let package_name = format!("{}/{}", tag, package_name);

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
