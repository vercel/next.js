use std::{
    path::PathBuf,
    process::{self, Stdio},
};

pub struct Command {
    bin: String,
    args: Vec<String>,
    error_message: String,
    dry_run: bool,
    current_dir: Option<PathBuf>,
}

impl Command {
    pub fn program<S: AsRef<str>>(bin: S) -> Self {
        Self {
            bin: bin.as_ref().to_owned(),
            args: vec![],
            error_message: String::new(),
            dry_run: false,
            current_dir: None,
        }
    }

    pub fn args<S: AsRef<str>, V: AsRef<[S]>>(mut self, args: V) -> Self {
        self.args
            .extend(args.as_ref().iter().map(|s| s.as_ref().to_string()));
        self
    }

    pub fn error_message<S: AsRef<str>>(mut self, message: S) -> Self {
        message.as_ref().clone_into(&mut self.error_message);
        self
    }

    pub fn dry_run(mut self, dry_run: bool) -> Self {
        self.dry_run = dry_run;
        self
    }

    pub fn current_dir(mut self, current_dir: PathBuf) -> Self {
        self.current_dir = Some(current_dir);
        self
    }

    pub fn execute(self) {
        let mut cmd = process::Command::new(self.bin);
        cmd.args(&self.args)
            .stderr(Stdio::inherit())
            .stdout(Stdio::inherit());
        if let Some(current_dir) = self.current_dir {
            cmd.current_dir(&current_dir);
        }
        if self.dry_run {
            println!("{:?}", cmd);
            return;
        }
        let status = cmd.status();
        assert!({
            if self.error_message.is_empty() {
                status.unwrap()
            } else {
                status.expect(&self.error_message)
            }
        }
        .success());
    }

    pub fn output_string(self) -> String {
        let mut cmd = process::Command::new(self.bin);
        cmd.args(&self.args).stderr(Stdio::inherit());
        if let Some(current_dir) = self.current_dir {
            cmd.current_dir(&current_dir);
        }
        let output = cmd.output();
        String::from_utf8({
            if self.error_message.is_empty() {
                output.unwrap().stdout
            } else {
                output.expect(&self.error_message).stdout
            }
        })
        .expect("Stdout contains non UTF-8 characters")
    }
}
