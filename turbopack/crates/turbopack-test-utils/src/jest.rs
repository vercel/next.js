use bincode::{Decode, Encode};
use serde::{Deserialize, Serialize};

// Defines common structures returned by jest/jest-circus. Shared across turbo
// and next.js repos.

/// The serialized form of the JS object returned from jest.run()
/// describing results.
#[derive(Clone, Debug, Serialize, Deserialize, Eq, PartialEq, Encode, Decode)]
#[serde(rename_all = "camelCase")]
pub struct JestRunResult {
    pub test_results: Vec<JestTestResult>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Eq, PartialEq, Encode, Decode)]
#[serde(rename_all = "camelCase")]
pub struct JestTestResult {
    pub test_path: Vec<String>,
    pub errors: Vec<String>,
}
