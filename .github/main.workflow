workflow "Generate pull request stats" {
  on = "pull_request"
  resolves = ["PR Stats"]
}

action "PR Stats" {
  uses = "zeit/next-stats-action@master"
  secrets = ["GITHUB_TOKEN"]
}
