use std::fmt::Write;

use anyhow::Result;
use turbo_tasks::{primitives::StringVc, Value, ValueToString, ValueToStringVc};
use turbo_tasks_fs::FileSystemPathVc;
use turbo_tasks_hash::{encode_hex, hash_xxh3_hash64, DeterministicHash, Xxh3Hash64Hasher};

use crate::resolve::{ModulePart, ModulePartVc};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Clone, Debug, PartialOrd, Ord, Hash)]
pub struct AssetIdent {
    /// The primary path of the asset
    pub path: FileSystemPathVc,
    /// The query string of the asset (e.g. `?foo=bar`)
    pub query: Option<StringVc>,
    /// The fragment of the asset (e.g. `#foo`)
    pub fragment: Option<StringVc>,
    /// The assets that are nested in this asset
    pub assets: Vec<(StringVc, AssetIdentVc)>,
    /// The modifiers of this asset (e.g. `client chunks`)
    pub modifiers: Vec<StringVc>,
    /// The part of the asset that is a (ECMAScript) module
    pub part: Option<ModulePartVc>,
}

impl AssetIdent {
    pub fn add_modifier(&mut self, modifier: StringVc) {
        self.modifiers.push(modifier);
    }

    pub fn add_asset(&mut self, key: StringVc, asset: AssetIdentVc) {
        self.assets.push((key, asset));
    }

    pub async fn rename_as(&mut self, pattern: &str) -> Result<()> {
        let root = self.path.root();
        let path = self.path.await?;
        self.path = root
            .join(&pattern.replace('*', &path.path))
            .resolve()
            .await?;
        Ok(())
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for AssetIdent {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        let mut s = self.path.to_string().await?.clone_value();
        if let Some(query) = &self.query {
            write!(s, "?{}", query.await?)?;
        }
        if let Some(fragment) = &self.fragment {
            write!(s, "#{}", fragment.await?)?;
        }
        for (key, asset) in &self.assets {
            write!(s, "/({})/{}", key.await?, asset.to_string().await?)?;
        }
        if !self.modifiers.is_empty() {
            s.push_str(" (");
            for (i, modifier) in self.modifiers.iter().enumerate() {
                if i > 0 {
                    s.push_str(", ");
                }
                s.push_str(&modifier.await?);
            }
            s.push(')');
        }
        Ok(StringVc::cell(s))
    }
}

#[turbo_tasks::value_impl]
impl AssetIdentVc {
    #[turbo_tasks::function]
    pub fn new(ident: Value<AssetIdent>) -> Self {
        ident.into_value().cell()
    }

    /// Creates an [AssetIdent] from a [FileSystemPathVc]
    #[turbo_tasks::function]
    pub fn from_path(path: FileSystemPathVc) -> Self {
        Self::new(Value::new(AssetIdent {
            path,
            query: None,
            fragment: None,
            assets: Vec::new(),
            modifiers: Vec::new(),
            part: None,
        }))
    }

    #[turbo_tasks::function]
    pub async fn with_modifier(self, modifier: StringVc) -> Result<Self> {
        let mut this = self.await?.clone_value();
        this.add_modifier(modifier);
        Ok(Self::new(Value::new(this)))
    }

    #[turbo_tasks::function]
    pub async fn with_part(self, part: ModulePartVc) -> Result<Self> {
        let mut this = self.await?.clone_value();
        this.part = Some(part);
        Ok(Self::new(Value::new(this)))
    }

    #[turbo_tasks::function]
    pub async fn rename_as(self, pattern: &str) -> Result<Self> {
        let mut this = self.await?.clone_value();
        this.rename_as(pattern).await?;
        Ok(Self::new(Value::new(this)))
    }

    #[turbo_tasks::function]
    pub async fn path(self) -> Result<FileSystemPathVc> {
        Ok(self.await?.path)
    }

    /// Computes a unique output asset name for the given asset identifier.
    /// TODO(alexkirsz) This is `turbopack-dev` specific, as `turbopack-build`
    /// would use a content hash instead. But for now both are using the same
    /// name generation logic.
    #[turbo_tasks::function]
    pub async fn output_name(
        self,
        context_path: FileSystemPathVc,
        expected_extension: &str,
    ) -> Result<StringVc> {
        let this = &*self.await?;

        // For clippy -- This explicit deref is necessary
        let path = &*this.path.await?;
        let mut name = if let Some(inner) = context_path.await?.get_path_to(path) {
            clean_separators(inner)
        } else {
            clean_separators(&this.path.to_string().await?)
        };
        let removed_extension = name.ends_with(expected_extension);
        if removed_extension {
            name.truncate(name.len() - expected_extension.len());
        }
        // This step ensures that leading dots are not preserved in file names. This is
        // important as some file servers do not serve files with leading dots (e.g.
        // Next.js).
        let mut name = clean_additional_extensions(&name);

        let default_modifier = match expected_extension {
            ".js" => Some("ecmascript"),
            ".css" => Some("css"),
            _ => None,
        };

        let mut hasher = Xxh3Hash64Hasher::new();
        let mut has_hash = false;
        let AssetIdent {
            path: _,
            query,
            fragment,
            assets,
            modifiers,
            part,
        } = this;
        if let Some(query) = query {
            0_u8.deterministic_hash(&mut hasher);
            query.await?.deterministic_hash(&mut hasher);
            has_hash = true;
        }
        if let Some(fragment) = fragment {
            1_u8.deterministic_hash(&mut hasher);
            fragment.await?.deterministic_hash(&mut hasher);
            has_hash = true;
        }
        for (key, ident) in assets.iter() {
            2_u8.deterministic_hash(&mut hasher);
            key.await?.deterministic_hash(&mut hasher);
            ident.to_string().await?.deterministic_hash(&mut hasher);
            has_hash = true;
        }
        for modifier in modifiers.iter() {
            let modifier = modifier.await?;
            if let Some(default_modifier) = default_modifier {
                if *modifier == default_modifier {
                    continue;
                }
            }
            3_u8.deterministic_hash(&mut hasher);
            modifier.deterministic_hash(&mut hasher);
            has_hash = true;
        }
        if let Some(part) = part {
            4_u8.deterministic_hash(&mut hasher);
            match &*part.await? {
                ModulePart::ModuleEvaluation => {
                    1_u8.deterministic_hash(&mut hasher);
                }
                ModulePart::Export(export) => {
                    2_u8.deterministic_hash(&mut hasher);
                    export.await?.deterministic_hash(&mut hasher);
                }
                ModulePart::Internal(id) => {
                    3_u8.deterministic_hash(&mut hasher);
                    id.deterministic_hash(&mut hasher);
                }
            }

            has_hash = true;
        }

        if has_hash {
            let hash = encode_hex(hasher.finish());
            let truncated_hash = &hash[..6];
            write!(name, "_{}", truncated_hash)?;
        }

        // Location in "path" where hashed and named parts are split.
        // Everything before i is hashed and after i named.
        let mut i = 0;
        static NODE_MODULES: &str = "_node_modules_";
        if let Some(j) = name.rfind(NODE_MODULES) {
            i = j + NODE_MODULES.len();
        }
        const MAX_FILENAME: usize = 80;
        if name.len() - i > MAX_FILENAME {
            i = name.len() - MAX_FILENAME;
            if let Some(j) = name[i..].find('_') {
                if j < 20 {
                    i += j + 1;
                }
            }
        }
        if i > 0 {
            let hash = encode_hex(hash_xxh3_hash64(name[..i].as_bytes()));
            let truncated_hash = &hash[..5];
            name = format!("{}_{}", truncated_hash, &name[i..]);
        }
        // We need to make sure that `.json` and `.json.js` doesn't end up with the same
        // name. So when we add an extra extension when want to mark that with a "._"
        // suffix.
        if !removed_extension {
            name += "._";
        }
        name += expected_extension;
        Ok(StringVc::cell(name))
    }
}

fn clean_separators(s: &str) -> String {
    s.replace('/', "_")
}

fn clean_additional_extensions(s: &str) -> String {
    s.replace('.', "_")
}
