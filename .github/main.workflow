workflow "Generate pull request stats" {
  on = "pull_request"
  resolves = ["PR Stats"]
}

workflow "Generate release stats" {
  on = "release"
  resolves = ["PR Stats"]
}

action "PR Stats" {
  uses = "zeit/next-stats-action@master"
  secrets = ["GITHUB_TOKEN", "PR_STATS_TEMP_TOKEN"]
}
