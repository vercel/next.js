use std::fmt::Write;

use anyhow::Result;
use turbo_tasks::{primitives::StringVc, Value, ValueToString, ValueToStringVc};
use turbo_tasks_fs::FileSystemPathVc;

use crate::resolve::ModulePartVc;

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
            .join(&pattern.replace("*", &path.path))
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
}
