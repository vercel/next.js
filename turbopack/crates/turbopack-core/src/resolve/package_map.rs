//! Resolution through a [Node.js package map], selected with [`ResolveModules::PackageMap`].
//!
//! A package map is a JSON file with a `packages` object. Each key is an opaque package ID, and
//! each entry has a required `url`, the location of the package, and an optional `dependencies`
//! object mapping the names the package may import to the package IDs they refer to:
//!
//! ```json
//! {
//!   "packages": {
//!     "app": { "url": "./packages/app", "dependencies": { "lib": "lib@1.0.0" } },
//!     "lib@1.0.0": { "url": "./store/lib-1.0.0" }
//!   }
//! }
//! ```
//!
//! A module request is then resolved by finding the package that contains the importer, looking
//! the requested name up in the `dependencies` of that package, and resolving the rest of the
//! request inside of the location of the package it refers to. The `node_modules` hierarchy isn't
//! involved.
//!
//! Module identity doesn't include a package ID, so the package of an importer is derived from its
//! path, which is the fallback the specification describes. When [several packages share one
//! location], an import from that location only resolves when all of them agree on where the
//! requested name leads.
//!
//! [Node.js package map]: https://nodejs.org/api/packages.html#package-maps
//! [several packages share one location]: https://nodejs.org/api/packages.html#multiple-packages-for-the-same-url
//! [`ResolveModules::PackageMap`]: crate::resolve::options::ResolveModules::PackageMap

use std::{borrow::Cow, collections::BTreeMap, fmt::Write, path::PathBuf};

use anyhow::{Result, bail};
use async_trait::async_trait;
use bincode::{Decode, Encode};
use rustc_hash::FxHashMap;
use serde_json::Value as JsonValue;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, ResolvedVc, ValueToStringRef, Vc, debug::ValueDebugFormat};
use turbo_tasks_fs::{DiskFileSystem, FileJsonContent, FileSystemEntryType, FileSystemPath};

use crate::{
    asset::Asset,
    file_source::FileSource,
    issue::{Issue, IssueExt, IssueSource, IssueStage, StyledString},
    resolve::pattern::Pattern,
    source::Source,
};

/// Where a package of a [`PackageMap`] is located.
#[derive(Clone, Debug, PartialEq, Eq, ValueDebugFormat, NonLocalValue, Encode, Decode)]
pub enum PackageMapLocation {
    /// The directory of the package, or the file of a package that consists of a single file.
    Path(FileSystemPath),
    /// The `url` of the package is valid, but doesn't lead to a path the filesystem of the package
    /// map can express. The reason completes the sentence "The package ...".
    Unavailable(RcStr),
}

/// A package of a [`PackageMap`].
#[derive(Clone, Debug, PartialEq, Eq, ValueDebugFormat, NonLocalValue, Encode, Decode)]
pub struct PackageMapPackage {
    pub location: PackageMapLocation,
    /// The names this package may import, with the ID of the package each of them refers to.
    pub dependencies: BTreeMap<RcStr, RcStr>,
}

/// The packages of a [`PackageMap`], by package ID.
#[turbo_tasks::value(transparent, cell = "keyed")]
pub struct PackageMapPackages(FxHashMap<RcStr, PackageMapPackage>);

/// The sorted IDs of the packages of a [`PackageMap`] that are located at a path.
#[turbo_tasks::value(transparent, cell = "keyed")]
pub struct PackageMapOwners(FxHashMap<FileSystemPath, Vec<RcStr>>);

/// A parsed [Node.js package map](https://nodejs.org/api/packages.html#package-maps).
#[turbo_tasks::value(shared)]
pub enum PackageMap {
    Loaded {
        packages: ResolvedVc<PackageMapPackages>,
        owners: ResolvedVc<PackageMapOwners>,
    },
    /// The package map can't be read or doesn't follow the configuration file format. A
    /// [`PackageMapIssue`] describing the problem was emitted, and no package can be found.
    Invalid,
}

/// A problem with the file of a package map, which keeps every package from being found.
#[turbo_tasks::value(shared)]
pub struct PackageMapIssue {
    pub path: FileSystemPath,
    pub message: RcStr,
    pub source: Option<IssueSource>,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for PackageMapIssue {
    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!("Invalid package map")))
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Resolve
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.path.clone())
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Text(self.message.clone())))
    }

    fn source(&self) -> Option<IssueSource> {
        self.source
    }
}

/// Reads and parses the package map at `path`.
///
/// An invalid package map emits a [`PackageMapIssue`] and results in [`PackageMap::Invalid`].
#[turbo_tasks::function]
pub async fn package_map(path: FileSystemPath) -> Result<Vc<PackageMap>> {
    let source: ResolvedVc<Box<dyn Source>> =
        ResolvedVc::upcast(FileSource::new(path.clone()).to_resolved().await?);
    let invalid = |message: String, source: Option<IssueSource>| {
        PackageMapIssue {
            path: path.clone(),
            message: message.into(),
            source,
        }
        .resolved_cell()
        .emit();
        PackageMap::Invalid.cell()
    };

    let content = source.content().parse_json().await?;
    let json = match &*content {
        FileJsonContent::Content(json) => json,
        FileJsonContent::NotFound => {
            return Ok(invalid("The package map doesn't exist.".to_string(), None));
        }
        FileJsonContent::Unparsable(error) => {
            return Ok(invalid(
                format!("The package map is not valid JSON: {}", error.message),
                Some(IssueSource::from_unparsable_json(source, error)),
            ));
        }
    };
    let invalid = |message: String| invalid(message, Some(IssueSource::from_source_only(source)));

    let Some(entries) = json.get("packages").and_then(JsonValue::as_object) else {
        return Ok(invalid(
            "The package map is missing its \"packages\" object.".to_string(),
        ));
    };

    // Node.js resolves the symlinks of the location of the package map, so that the locations of
    // its packages match the real paths of the modules that import from them.
    let base = match path.realpath().await? {
        Ok(path) => path.parent(),
        Err(_) => path.parent(),
    };
    // Absolute locations can only be expressed for a filesystem that is backed by the disk.
    let disk_fs = match ResolvedVc::try_downcast_type::<DiskFileSystem>(base.fs) {
        Some(fs) => Some((fs, fs.await?)),
        None => None,
    };

    let mut packages = FxHashMap::with_capacity_and_hasher(entries.len(), Default::default());
    let mut owners: FxHashMap<FileSystemPath, Vec<RcStr>> = FxHashMap::default();
    for (id, entry) in entries {
        let Some(entry) = entry.as_object() else {
            return Ok(invalid(format!("Package {id:?} must be an object.")));
        };
        let url = match entry.get("url") {
            Some(JsonValue::String(url)) if url.is_empty() => {
                return Ok(invalid(format!(
                    "Package {id:?} has an empty \"url\" field."
                )));
            }
            Some(JsonValue::String(url)) => url,
            Some(_) => {
                return Ok(invalid(format!(
                    "Package {id:?} has an invalid \"url\" field: it must be a string."
                )));
            }
            None => {
                return Ok(invalid(format!(
                    "Package {id:?} is missing its \"url\" field."
                )));
            }
        };
        let mut dependencies = BTreeMap::new();
        match entry.get("dependencies") {
            None | Some(JsonValue::Null) => {}
            Some(JsonValue::Object(entries)) => {
                for (name, dependency_id) in entries {
                    let Some(dependency_id) = dependency_id.as_str() else {
                        return Ok(invalid(format!(
                            "Package {id:?} has an invalid dependency {name:?}: it must refer to \
                             a package ID with a string."
                        )));
                    };
                    dependencies.insert(RcStr::from(name.as_str()), RcStr::from(dependency_id));
                }
            }
            Some(_) => {
                return Ok(invalid(format!(
                    "Package {id:?} has an invalid \"dependencies\" field: it must be an object."
                )));
            }
        }

        let location = match parse_package_url(url) {
            Ok(PackageUrl::Relative(relative)) => match base.try_join(&relative) {
                Some(path) => PackageMapLocation::Path(path),
                None => PackageMapLocation::Unavailable(outside_of_root(url)),
            },
            Ok(PackageUrl::Absolute(absolute)) => match &disk_fs {
                Some((fs, fs_value)) => {
                    #[cfg(windows)]
                    let absolute = {
                        let Some(absolute) =
                            windows_absolute_path(absolute, &fs_value.to_sys_path(&base))
                        else {
                            return Ok(invalid(format!(
                                "Package {id:?} has an invalid file URL {url:?}."
                            )));
                        };
                        absolute
                    };
                    match fs_value.try_from_sys_path(*fs, &absolute, None) {
                        Some(path) => PackageMapLocation::Path(path),
                        None => PackageMapLocation::Unavailable(outside_of_root(url)),
                    }
                }
                None => PackageMapLocation::Unavailable(
                    format!(
                        "is located at {url:?}, and an absolute URL can only be used on a disk \
                         filesystem"
                    )
                    .into(),
                ),
            },
            Err(reason) => {
                return Ok(invalid(format!("Package {id:?} has {reason}.")));
            }
        };

        let id = RcStr::from(id.as_str());
        if let PackageMapLocation::Path(path) = &location {
            owners.entry(path.clone()).or_default().push(id.clone());
        }
        packages.insert(
            id,
            PackageMapPackage {
                location,
                dependencies,
            },
        );
    }
    for ids in owners.values_mut() {
        ids.sort();
    }

    Ok(PackageMap::Loaded {
        packages: ResolvedVc::cell(packages),
        owners: ResolvedVc::cell(owners),
    }
    .cell())
}

fn outside_of_root(url: &str) -> RcStr {
    format!("is located at {url:?}, which is outside of the root of the filesystem").into()
}

/// Why a package map couldn't tell where a requested package is.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum PackageMapMiss {
    /// The package map is [`PackageMap::Invalid`].
    Invalid,
    /// No package of the map contains the importer.
    ExternalFile,
    /// The packages that contain the importer don't depend on the requested name.
    NotADependency { package_ids: Vec<RcStr> },
    /// Several packages share the location that contains the importer, and they disagree on where
    /// the requested name leads.
    Ambiguous { package_ids: Vec<RcStr> },
    /// A dependency refers to a package ID that the map doesn't define.
    UndefinedPackage {
        package_id: RcStr,
        dependency_id: RcStr,
    },
    /// A dependency refers to a package with a [`PackageMapLocation::Unavailable`] location.
    UnavailablePackage { dependency_id: RcStr, reason: RcStr },
}

/// The result of looking a package name up in a package map.
pub(crate) enum PackageMapLookup {
    /// The requested names the importing package depends on, with the location of the package each
    /// of them refers to. A request that isn't constant can match several names.
    Found(Vec<(RcStr, FileSystemPath)>),
    Miss(PackageMapMiss),
}

/// Finds the locations of the packages that `package_name` refers to when it is imported from the
/// directory `lookup_path`, with the package map at `map_path`.
///
/// Implements `FIND_PACKAGE_ID(PATH, PACKAGE_MAP)` and steps 2 to 6 of
/// `LOAD_PACKAGE_MAP(X, PARENT_PACKAGE_ID, PACKAGE_MAP)` of the [resolution algorithm of Node.js].
///
/// This reads the package map through keyed cells, so it must be called from the task that
/// depends on the result.
///
/// [resolution algorithm of Node.js]: https://nodejs.org/api/modules.html#all-together
pub(crate) async fn lookup_package_map(
    map_path: &FileSystemPath,
    lookup_path: &FileSystemPath,
    package_name: &Pattern,
) -> Result<PackageMapLookup> {
    let PackageMap::Loaded { packages, owners } = &*package_map(map_path.clone()).await? else {
        return Ok(PackageMapLookup::Miss(PackageMapMiss::Invalid));
    };

    // The nearest ancestor that is the location of a package owns the importer.
    let package_ids = {
        let owners = owners.keyed_reader().await?;
        let mut path = lookup_path.clone();
        loop {
            if let Some(package_ids) = owners.get(&path) {
                break package_ids.clone();
            }
            if path.is_root() {
                return Ok(PackageMapLookup::Miss(PackageMapMiss::ExternalFile));
            }
            path = path.parent();
        }
    };

    let packages = packages.keyed_reader().await?;
    let constant_name = package_name.as_constant_string();
    let mut found: Option<Vec<(RcStr, FileSystemPath)>> = None;
    let mut miss = None;
    for package_id in &package_ids {
        let Some(package) = packages.get(package_id) else {
            // The two cells of the package map can be read from different executions.
            bail!("package map has no package {package_id:?} for the location it is the owner of");
        };
        let dependencies = match constant_name {
            Some(name) => package
                .dependencies
                .get_key_value(name)
                .into_iter()
                .collect(),
            None => package
                .dependencies
                .iter()
                .filter(|(name, _)| package_name.is_match(name))
                .collect::<Vec<_>>(),
        };
        let mut targets = Vec::with_capacity(dependencies.len());
        for (name, dependency_id) in dependencies {
            match packages.get(dependency_id).map(|package| &package.location) {
                Some(PackageMapLocation::Path(path)) => {
                    targets.push((name.clone(), path.clone()));
                }
                Some(PackageMapLocation::Unavailable(reason)) => {
                    miss.get_or_insert_with(|| PackageMapMiss::UnavailablePackage {
                        dependency_id: dependency_id.clone(),
                        reason: reason.clone(),
                    });
                }
                None => {
                    miss.get_or_insert_with(|| PackageMapMiss::UndefinedPackage {
                        package_id: package_id.clone(),
                        dependency_id: dependency_id.clone(),
                    });
                }
            }
        }
        match &found {
            None => found = Some(targets),
            // Without the ID of the importing package, the packages that share its location are
            // only interchangeable when the request leads to the same place from each of them.
            Some(found) if *found != targets => {
                return Ok(PackageMapLookup::Miss(PackageMapMiss::Ambiguous {
                    package_ids,
                }));
            }
            Some(_) => {}
        }
    }

    let found = found.unwrap_or_default();
    if found.is_empty() {
        return Ok(PackageMapLookup::Miss(
            miss.unwrap_or(PackageMapMiss::NotADependency { package_ids }),
        ));
    }
    Ok(PackageMapLookup::Found(found))
}

/// Explains why the package map at `map_path` doesn't lead to a module for a request for
/// `package_name` from the directory `lookup_path`, for the description of a resolving issue.
///
/// Returns `None` when the package map found a package, so the request failed inside of it.
#[turbo_tasks::function]
pub(crate) async fn package_map_miss_explanation(
    map_path: FileSystemPath,
    lookup_path: FileSystemPath,
    package_name: Pattern,
) -> Result<Vc<Option<RcStr>>> {
    let list = |package_ids: &[RcStr]| {
        package_ids
            .iter()
            .map(|package_id| format!("{package_id:?}"))
            .collect::<Vec<_>>()
            .join(", ")
    };
    let map = map_path.to_string_ref().await?;
    let name = match package_name.as_constant_string() {
        Some(name) => format!("{name:?}"),
        None => "the requested package".to_string(),
    };
    let explanation = match lookup_package_map(&map_path, &lookup_path, &package_name).await? {
        PackageMapLookup::Found(targets) => {
            let mut missing = String::new();
            for (name, location) in targets {
                if *location.get_type().await? == FileSystemEntryType::NotFound {
                    if !missing.is_empty() {
                        missing.push(' ');
                    }
                    write!(
                        missing,
                        "{map} locates {name:?} at {}, which doesn't exist.",
                        location.to_string_ref().await?
                    )?;
                }
            }
            if missing.is_empty() {
                return Ok(Vc::cell(None));
            }
            missing
        }
        PackageMapLookup::Miss(PackageMapMiss::Invalid) => {
            format!("{map} is invalid, so no package can be found.")
        }
        PackageMapLookup::Miss(PackageMapMiss::ExternalFile) => {
            format!("the importing file is not within any package defined in {map}.")
        }
        PackageMapLookup::Miss(PackageMapMiss::NotADependency { package_ids }) => format!(
            "{name} is not in the dependencies of the importing package {} in {map}.",
            list(&package_ids)
        ),
        PackageMapLookup::Miss(PackageMapMiss::Ambiguous { package_ids }) => format!(
            "the importing file is within the packages {} of {map}, which share one location but \
             don't agree on where {name} is.",
            list(&package_ids)
        ),
        PackageMapLookup::Miss(PackageMapMiss::UndefinedPackage {
            package_id,
            dependency_id,
        }) => format!(
            "the dependencies of {package_id:?} refer to the package ID {dependency_id:?}, which \
             is not defined in {map}."
        ),
        PackageMapLookup::Miss(PackageMapMiss::UnavailablePackage {
            dependency_id,
            reason,
        }) => format!("the package {dependency_id:?} of {map} {reason}."),
    };
    Ok(Vc::cell(Some(explanation.into())))
}

/// The location a `url` of a package map refers to.
#[derive(Debug, PartialEq, Eq)]
enum PackageUrl {
    /// A `/`-separated path relative to the directory of the package map, which can contain `.`
    /// and `..` segments.
    Relative(String),
    /// An absolute path of the system. On Windows, a path without a drive or a host is relative
    /// to the root of the drive or of the host of the package map.
    Absolute(PathBuf),
}

/// Parses the `url` of a package, which is resolved against the URL of the package map with the
/// semantics of a WHATWG URL. Only `file:` URLs and relative URLs are supported.
///
/// The error completes the sentence "Package ... has".
fn parse_package_url(value: &str) -> Result<PackageUrl, String> {
    // WHATWG URL parsing trims leading and trailing C0 controls and spaces, and removes ASCII tabs
    // and newlines anywhere in the input. Backslashes are path separators for `file:` URLs,
    // including relative URLs resolved against a `file:` base.
    let value = value.trim_matches(|character: char| character <= '\u{20}');
    let value = if value.contains(['\\', '\t', '\n', '\r']) {
        Cow::Owned(
            value
                .chars()
                .filter_map(|character| match character {
                    '\t' | '\n' | '\r' => None,
                    '\\' => Some('/'),
                    character => Some(character),
                })
                .collect::<String>(),
        )
    } else {
        Cow::Borrowed(value)
    };
    // The query and the fragment do not take part in the file path.
    let value = value
        .split_once(['?', '#'])
        .map_or(value.as_ref(), |(path, _)| path);
    let invalid = || format!("an invalid file URL {value:?}");

    let scheme = split_url_scheme(value);
    if scheme.is_some_and(|(scheme, _)| !scheme.eq_ignore_ascii_case("file")) {
        return Err(format!(
            "an unsupported URL scheme in {value:?}; only file URLs and relative URLs are \
             supported"
        ));
    }
    if has_invalid_percent_encoding(value) {
        return Err(invalid());
    }

    let path = match scheme {
        // A protocol-relative URL, such as `//localhost/path`.
        None if value.starts_with("//") => {
            return file_url_to_path(&value[2..]).ok_or_else(invalid);
        }
        None => value,
        // `file://host/path` and `file:///path`.
        Some((_, rest)) if rest.starts_with("//") => {
            return file_url_to_path(&rest[2..]).ok_or_else(invalid);
        }
        // `file:C:/path`.
        Some((_, rest))
            if starts_with_drive_letter(rest) && rest.as_bytes().get(2) == Some(&b'/') =>
        {
            return file_url_to_path(rest).ok_or_else(invalid);
        }
        // `file:path` and `file:/path` are resolved from the package map like relative URLs.
        Some((_, rest)) => rest,
    };

    if has_encoded_separators(path) {
        return Err(invalid());
    }
    let path = percent_decode(path).ok_or_else(invalid)?;
    if path.starts_with('/') {
        return Ok(PackageUrl::Absolute(absolute_path(&path)));
    }
    Ok(PackageUrl::Relative(path.trim_end_matches('/').to_string()))
}

/// Converts the part of a `file:` URL that follows `file://` to a path.
///
/// Follows `fileURLToPath` of Node.js: a host is only accepted on Windows, where it creates a UNC
/// path.
fn file_url_to_path(after_scheme: &str) -> Option<PackageUrl> {
    let authority = after_scheme.split('/').next().unwrap_or_default();
    // `file://C:/path` holds a drive letter where the host is expected.
    let (host, pathname) = if is_drive_authority(authority) {
        ("", after_scheme)
    } else {
        (
            authority,
            after_scheme[authority.len()..]
                .strip_prefix('/')
                .unwrap_or_default(),
        )
    };

    let host = percent_decode(host)?;
    if has_invalid_host(&host) {
        return None;
    }
    // The WHATWG URL parser normalizes the "localhost" host of a `file:` URL to the empty host.
    let host = if host.eq_ignore_ascii_case("localhost") {
        ""
    } else {
        host.as_ref()
    };

    if has_encoded_separators(pathname) {
        return None;
    }
    let pathname = percent_decode(pathname)?;

    if cfg!(windows) {
        if !host.is_empty() {
            return Some(PackageUrl::Absolute(PathBuf::from(format!(
                r"\\{host}\{}",
                pathname.replace('/', "\\")
            ))));
        }
        // Without a host, the path of a `file:` URL starts with a drive on Windows.
        if !starts_with_drive_letter(&pathname) {
            return None;
        }
        Some(PackageUrl::Absolute(PathBuf::from(
            pathname.replace('/', "\\"),
        )))
    } else {
        if !host.is_empty() {
            return None;
        }
        Some(PackageUrl::Absolute(absolute_path(&format!("/{pathname}"))))
    }
}

/// Converts the decoded path of a URL, which starts with `/`, to a path of the system.
fn absolute_path(path: &str) -> PathBuf {
    if cfg!(windows) {
        // `/C:/path` selects a drive. Any other path stays relative to the root of the drive or of
        // the host of the package map, which `windows_absolute_path` adds.
        let path = match path.strip_prefix('/') {
            Some(rest) if starts_with_drive_letter(rest) => rest,
            _ => path,
        };
        PathBuf::from(path.replace('/', "\\"))
    } else {
        PathBuf::from(path)
    }
}

/// Completes a path of [`PackageUrl::Absolute`] that has no drive and no host with the ones of the
/// directory of the package map, as a root-relative URL is resolved against the URL of the map.
#[cfg(windows)]
fn windows_absolute_path(path: PathBuf, base: &std::path::Path) -> Option<PathBuf> {
    use std::path::Component;

    if matches!(path.components().next(), Some(Component::Prefix(_))) {
        return Some(path);
    }
    let Some(Component::Prefix(prefix)) = base.components().next() else {
        return None;
    };
    let mut absolute = PathBuf::from(prefix.as_os_str());
    absolute.push(path);
    Some(absolute)
}

fn split_url_scheme(value: &str) -> Option<(&str, &str)> {
    if !value.as_bytes().first()?.is_ascii_alphabetic() {
        return None;
    }
    for (index, byte) in value.bytes().enumerate().skip(1) {
        if byte == b':' {
            return Some((&value[..index], &value[index + 1..]));
        }
        if !byte.is_ascii_alphanumeric() && !matches!(byte, b'+' | b'-' | b'.') {
            return None;
        }
    }
    None
}

/// Whether `value` starts with a Windows drive letter and its colon, e.g. `C:`.
fn starts_with_drive_letter(value: &str) -> bool {
    matches!(value.as_bytes(), [drive, b':', ..] if drive.is_ascii_alphabetic())
}

fn is_drive_authority(authority: &str) -> bool {
    authority.len() == 2 && starts_with_drive_letter(authority)
}

fn has_invalid_host(host: &str) -> bool {
    if host.is_empty() {
        return false;
    }
    if host.contains(['@', '/', '\\']) || host.chars().any(|character| character <= '\u{20}') {
        return true;
    }
    if let Some(ipv6) = host.strip_prefix('[') {
        return ipv6
            .strip_suffix(']')
            .is_none_or(|address| address.parse::<std::net::Ipv6Addr>().is_err());
    }
    host.contains(':')
}

/// Whether `value` has a `%` that does not start a percent-encoded byte.
fn has_invalid_percent_encoding(value: &str) -> bool {
    let bytes = value.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if !(bytes.get(index + 1).is_some_and(u8::is_ascii_hexdigit)
                && bytes.get(index + 2).is_some_and(u8::is_ascii_hexdigit))
            {
                return true;
            }
            index += 3;
        } else {
            index += 1;
        }
    }
    false
}

/// Whether `pathname` has a percent-encoded path separator, which `fileURLToPath` rejects: `%2F`
/// (`/`) and, on Windows, `%5C` (`\`).
fn has_encoded_separators(pathname: &str) -> bool {
    pathname.as_bytes().windows(3).any(|window| {
        window[0] == b'%'
            && ((window[1] == b'2' && window[2].eq_ignore_ascii_case(&b'f'))
                || (cfg!(windows) && window[1] == b'5' && window[2].eq_ignore_ascii_case(&b'c')))
    })
}

/// Decodes the percent-encoded bytes of `value`, which [`has_invalid_percent_encoding`] accepted.
///
/// Returns `None` when the decoded bytes are not UTF-8.
fn percent_decode(value: &str) -> Option<Cow<'_, str>> {
    if !value.contains('%') {
        return Some(Cow::Borrowed(value));
    }
    let hex = |byte: u8| char::from(byte).to_digit(16).map(|digit| digit as u8);
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let high = hex(*bytes.get(index + 1)?)?;
            let low = hex(*bytes.get(index + 2)?)?;
            decoded.push(high << 4 | low);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).ok().map(Cow::Owned)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn relative(path: &str) -> Result<PackageUrl, String> {
        Ok(PackageUrl::Relative(path.to_string()))
    }

    #[test]
    fn relative_urls() {
        assert_eq!(
            parse_package_url("./packages/app"),
            relative("./packages/app")
        );
        assert_eq!(parse_package_url("packages/app/"), relative("packages/app"));
        assert_eq!(parse_package_url("../store/dep"), relative("../store/dep"));
        assert_eq!(parse_package_url("."), relative("."));
        assert_eq!(parse_package_url("./"), relative("."));
        // The surrounding whitespace, the query and the fragment are not part of the path, and
        // backslashes are separators.
        assert_eq!(
            parse_package_url("  .\\store\\dep?query#fragment\n"),
            relative("./store/dep")
        );
        assert_eq!(
            parse_package_url("./store/a%20b%2Fc"),
            Err("an invalid file URL \"./store/a%20b%2Fc\"".to_string())
        );
        assert_eq!(parse_package_url("./store/a%20b"), relative("./store/a b"));
        // A `file:` URL without a root is resolved like a relative URL.
        assert_eq!(parse_package_url("file:store/dep"), relative("store/dep"));
        assert_eq!(
            parse_package_url("FILE:./store/dep"),
            relative("./store/dep")
        );
    }

    #[test]
    fn invalid_urls() {
        assert_eq!(
            parse_package_url("https://example.com/dep"),
            Err(
                "an unsupported URL scheme in \"https://example.com/dep\"; only file URLs and \
                 relative URLs are supported"
                    .to_string()
            )
        );
        assert_eq!(
            parse_package_url("./store/100%"),
            Err("an invalid file URL \"./store/100%\"".to_string())
        );
        assert_eq!(
            parse_package_url("./store/%ff"),
            Err("an invalid file URL \"./store/%ff\"".to_string())
        );
        assert_eq!(
            parse_package_url("file://user@host/dep"),
            Err("an invalid file URL \"file://user@host/dep\"".to_string())
        );
    }

    #[cfg(not(windows))]
    #[test]
    fn absolute_urls() {
        let absolute = |path: &str| Ok(PackageUrl::Absolute(PathBuf::from(path)));
        assert_eq!(parse_package_url("/store/dep"), absolute("/store/dep"));
        assert_eq!(parse_package_url("file:/store/dep"), absolute("/store/dep"));
        assert_eq!(
            parse_package_url("file:///store/dep"),
            absolute("/store/dep")
        );
        assert_eq!(
            parse_package_url("file://localhost/store/a%20b"),
            absolute("/store/a b")
        );
        assert_eq!(
            parse_package_url("//localhost/store/dep"),
            absolute("/store/dep")
        );
        // A host is only meaningful on Windows.
        assert_eq!(
            parse_package_url("file://server/share/dep"),
            Err("an invalid file URL \"file://server/share/dep\"".to_string())
        );
    }

    #[cfg(windows)]
    #[test]
    fn absolute_urls() {
        let absolute = |path: &str| Ok(PackageUrl::Absolute(PathBuf::from(path)));
        assert_eq!(
            parse_package_url("file:///C:/store/dep"),
            absolute(r"C:\store\dep")
        );
        assert_eq!(
            parse_package_url("file://C:/store/dep"),
            absolute(r"C:\store\dep")
        );
        assert_eq!(
            parse_package_url("file:C:/store/dep"),
            absolute(r"C:\store\dep")
        );
        assert_eq!(
            parse_package_url("/C:/store/dep"),
            absolute(r"C:\store\dep")
        );
        assert_eq!(
            parse_package_url("file://server/share/dep"),
            absolute(r"\\server\share\dep")
        );
        // The drive of the package map completes a path without one.
        assert_eq!(parse_package_url("/store/dep"), absolute(r"\store\dep"));
        assert_eq!(
            windows_absolute_path(
                PathBuf::from(r"\store\dep"),
                std::path::Path::new(r"D:\repo")
            ),
            Some(PathBuf::from(r"D:\store\dep"))
        );
        assert_eq!(
            parse_package_url("file:///store/dep"),
            Err("an invalid file URL \"file:///store/dep\"".to_string())
        );
    }
}
