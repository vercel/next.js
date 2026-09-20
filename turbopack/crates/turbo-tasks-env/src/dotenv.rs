use std::io::Read;

use anyhow::{Context, Result};
use turbo_tasks::{ReadRef, ResolvedVc, Vc, turbofmt};
use turbo_tasks_fs::{FileContent, FileSystemPath};

use crate::{ProcessEnv, TransientEnvMap, dotenv_parse::parse_dotenv_into};

/// Load the environment variables defined via a dotenv file, with an
/// optional prior state that we can lookup already defined variables
/// from.
#[turbo_tasks::value]
pub struct DotenvProcessEnv {
    prior: Option<ResolvedVc<Box<dyn ProcessEnv>>>,
    path: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl DotenvProcessEnv {
    #[turbo_tasks::function]
    pub fn new(prior: Option<ResolvedVc<Box<dyn ProcessEnv>>>, path: FileSystemPath) -> Vc<Self> {
        DotenvProcessEnv { prior, path }.cell()
    }

    #[turbo_tasks::function]
    pub fn read_prior(&self) -> Vc<TransientEnvMap> {
        match self.prior {
            None => TransientEnvMap::empty(),
            Some(p) => p.read_all(),
        }
    }

    #[turbo_tasks::function]
    pub async fn read_all_with_prior(
        &self,
        prior: Vc<TransientEnvMap>,
    ) -> Result<Vc<TransientEnvMap>> {
        let prior = prior.await?;

        let file = self.path.read().await?;
        if let FileContent::Content(f) = &*file {
            // The parser resolves variable references against the supplied
            // map — no process-global environment mutation (which is unsound
            // from multi-threaded code) is involved at all.
            let mut vars = (*prior).clone();
            // The OS environment is case-insensitive on Windows and collapses
            // case-variant duplicates (last wins) — mirror that before parsing.
            #[cfg(windows)]
            crate::dotenv_parse::dedupe_case_insensitive(&mut vars);
            let mut content = String::new();
            if let Err(e) = f.read().read_to_string(&mut content) {
                // ast-grep-ignore: no-context-turbofmt
                return Err(e)
                    .context(turbofmt!("unable to read {} for env vars", self.path).await?);
            }
            parse_dotenv_into(&content, &mut vars);
            vars.sort_keys();

            Ok(Vc::cell(vars))
        } else {
            // We want to cell the value here and not just return the Vc.
            // This is important to avoid Vc changes when adding/removing the env file.
            Ok(ReadRef::cell(prior))
        }
    }
}

#[turbo_tasks::value_impl]
impl ProcessEnv for DotenvProcessEnv {
    #[turbo_tasks::function]
    fn read_all(self: Vc<Self>) -> Vc<TransientEnvMap> {
        let prior = self.read_prior();
        self.read_all_with_prior(prior)
    }
}
