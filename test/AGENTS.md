# Test review instructions

- During code review, flag any change that newly disables, skips, or omits deploy-mode tests or assertions, including `skipDeployment: true` and `isNextDeploy` conditionals. Only allow this when the assertion is inherently specific to self-hosted behavior; even then, prefer an explicit deploy-mode assertion that documents the different deployed semantics.
