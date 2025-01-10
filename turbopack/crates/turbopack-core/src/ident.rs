use std::fmt::Write;

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Value, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::{encode_hex, hash_xxh3_hash64, DeterministicHash, Xxh3Hash64Hasher};

use crate::resolve::ModulePart;

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Clone, Debug, Hash)]
pub struct AssetIdent {
    /// The primary path of the asset
    pub path: ResolvedVc<FileSystemPath>,
    /// The query string of the asset (e.g. `?foo=bar`)
    pub query: ResolvedVc<RcStr>,
    /// The fragment of the asset (e.g. `#foo`)
    pub fragment: Option<ResolvedVc<RcStr>>,
    /// The assets that are nested in this asset
    pub assets: Vec<(ResolvedVc<RcStr>, ResolvedVc<AssetIdent>)>,
    /// The modifiers of this asset (e.g. `client chunks`)
    pub modifiers: Vec<ResolvedVc<RcStr>>,
    /// The parts of the asset that are (ECMAScript) modules
    pub parts: Vec<ResolvedVc<ModulePart>>,
    /// The asset layer the asset was created from.
    pub layer: Option<ResolvedVc<RcStr>>,
}

impl AssetIdent {
    pub fn add_modifier(&mut self, modifier: ResolvedVc<RcStr>) {
        self.modifiers.push(modifier);
    }

    pub fn add_asset(&mut self, key: ResolvedVc<RcStr>, asset: ResolvedVc<AssetIdent>) {
        self.assets.push((key, asset));
    }

    pub async fn rename_as_ref(&mut self, pattern: &str) -> Result<()> {
        let root = self.path.root();
        let path = self.path.await?;
        self.path = root
            .join(pattern.replace('*', &path.path).into())
            .to_resolved()
            .await?;
        Ok(())
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for AssetIdent {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        let mut s = self.path.to_string().await?.clone_value().into_owned();

        let query = self.query.await?;
        if !query.is_empty() {
            write!(s, "{}", &*query)?;
        }

        if let Some(fragment) = &self.fragment {
            write!(s, "#{}", fragment.await?)?;
        }

        if !self.assets.is_empty() {
            s.push_str(" {");

            for (i, (key, asset)) in self.assets.iter().enumerate() {
                if i > 0 {
                    s.push(',');
                }

                let key_str = key.await?;
                let asset_str = asset.to_string().await?;
                write!(s, " {} => {:?}", key_str, asset_str)?;
            }

            s.push_str(" }");
        }

        if let Some(layer) = &self.layer {
            write!(s, " [{}]", layer.await?)?;
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

        if !self.parts.is_empty() {
            for part in self.parts.iter() {
                let part = part.to_string().await?;
                // facade is not included in ident as switching between facade and non-facade
                // shouldn't change the ident
                if part.as_str() != "facade" {
                    write!(s, " <{}>", part)?;
                }
            }
        }

        Ok(Vc::cell(s.into()))
    }
}

#[turbo_tasks::value_impl]
impl AssetIdent {
    #[turbo_tasks::function]
    pub fn new(ident: Value<AssetIdent>) -> Vc<Self> {
        ident.into_value().cell()
    }

    /// Creates an [AssetIdent] from a [Vc<FileSystemPath>]
    #[turbo_tasks::function]
    pub fn from_path(path: ResolvedVc<FileSystemPath>) -> Vc<Self> {
        Self::new(Value::new(AssetIdent {
            path,
            query: ResolvedVc::cell(RcStr::default()),
            fragment: None,
            assets: Vec::new(),
            modifiers: Vec::new(),
            parts: Vec::new(),
            layer: None,
        }))
    }

    #[turbo_tasks::function]
    pub fn with_query(&self, query: ResolvedVc<RcStr>) -> Vc<Self> {
        let mut this = self.clone();
        this.query = query;
        Self::new(Value::new(this))
    }

    #[turbo_tasks::function]
    pub fn with_modifier(&self, modifier: ResolvedVc<RcStr>) -> Vc<Self> {
        let mut this = self.clone();
        this.add_modifier(modifier);
        Self::new(Value::new(this))
    }

    #[turbo_tasks::function]
    pub fn with_part(&self, part: ResolvedVc<ModulePart>) -> Vc<Self> {
        let mut this = self.clone();
        this.parts.push(part);
        Self::new(Value::new(this))
    }

    #[turbo_tasks::function]
    pub fn with_path(&self, path: ResolvedVc<FileSystemPath>) -> Vc<Self> {
        let mut this = self.clone();
        this.path = path;
        Self::new(Value::new(this))
    }

    #[turbo_tasks::function]
    pub fn with_layer(&self, layer: ResolvedVc<RcStr>) -> Vc<Self> {
        let mut this = self.clone();
        this.layer = Some(layer);
        Self::new(Value::new(this))
    }

    #[turbo_tasks::function]
    pub async fn rename_as(&self, pattern: RcStr) -> Result<Vc<Self>> {
        let mut this = self.clone();
        this.rename_as_ref(&pattern).await?;
        Ok(Self::new(Value::new(this)))
    }

    #[turbo_tasks::function]
    pub fn path(&self) -> Vc<FileSystemPath> {
        *self.path
    }

    #[turbo_tasks::function]
    pub fn query(&self) -> Vc<RcStr> {
        *self.query
    }

    /// Computes a unique output asset name for the given asset identifier.
    /// TODO(alexkirsz) This is `turbopack-browser` specific, as
    /// `turbopack-nodejs` would use a content hash instead. But for now
    /// both are using the same name generation logic.
    #[turbo_tasks::function]
    pub async fn output_name(
        &self,
        context_path: Vc<FileSystemPath>,
        expected_extension: RcStr,
    ) -> Result<Vc<RcStr>> {
        // TODO(PACK-2140): restrict character set to A–Za–z0–9-_.~'()
        // to be compatible with all operating systems + URLs.

        // For clippy -- This explicit deref is necessary
        let path = &*self.path.await?;
        let mut name = if let Some(inner) = context_path.await?.get_path_to(path) {
            clean_separators(inner)
        } else {
            clean_separators(&self.path.to_string().await?)
        };
        let removed_extension = name.ends_with(&*expected_extension);
        if removed_extension {
            name.truncate(name.len() - expected_extension.len());
        }
        // This step ensures that leading dots are not preserved in file names. This is
        // important as some file servers do not serve files with leading dots (e.g.
        // Next.js).
        let mut name = clean_additional_extensions(&name);

        let default_modifier = match expected_extension.as_str() {
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
            parts,
            layer,
        } = self;
        let query = query.await?;
        if !query.is_empty() {
            0_u8.deterministic_hash(&mut hasher);
            query.deterministic_hash(&mut hasher);
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
        for part in parts.iter() {
            4_u8.deterministic_hash(&mut hasher);
            match &*part.await? {
                ModulePart::Evaluation => {
                    1_u8.deterministic_hash(&mut hasher);
                }
                ModulePart::Export(export) => {
                    2_u8.deterministic_hash(&mut hasher);
                    export.await?.deterministic_hash(&mut hasher);
                }
                ModulePart::RenamedExport {
                    original_export,
                    export,
                } => {
                    3_u8.deterministic_hash(&mut hasher);
                    original_export.await?.deterministic_hash(&mut hasher);
                    export.await?.deterministic_hash(&mut hasher);
                }
                ModulePart::RenamedNamespace { export } => {
                    4_u8.deterministic_hash(&mut hasher);
                    export.await?.deterministic_hash(&mut hasher);
                }
                ModulePart::Internal(id) => {
                    5_u8.deterministic_hash(&mut hasher);
                    id.deterministic_hash(&mut hasher);
                }
                ModulePart::InternalEvaluation(id) => {
                    6_u8.deterministic_hash(&mut hasher);
                    id.deterministic_hash(&mut hasher);
                }
                ModulePart::Locals => {
                    7_u8.deterministic_hash(&mut hasher);
                }
                ModulePart::Exports => {
                    8_u8.deterministic_hash(&mut hasher);
                }
                ModulePart::Facade => {
                    9_u8.deterministic_hash(&mut hasher);
                }
            }

            has_hash = true;
        }
        if let Some(layer) = layer {
            1_u8.deterministic_hash(&mut hasher);
            layer.await?.deterministic_hash(&mut hasher);
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
        name += &expected_extension;
        Ok(Vc::cell(name.into()))
    }
}

fn clean_separators(s: &str) -> String {
    s.replace('/', "_")
}

fn clean_additional_extensions(s: &str) -> String {
    s.replace('.', "_")
}
