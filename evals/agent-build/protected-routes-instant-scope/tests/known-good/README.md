# Known-good solutions

Reviewed passing solutions from calibration runs, kept so the grader has to
accept implementations shaped differently from the reference. Each script
applies its recorded files to the untouched fixture and must receive reward 1.

| Script                  | Approach                                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `suspended-greeting.sh` | A proxy redirects signed-out requests, the layout and pages suspend their session reads, and the greeting's loading fallback reuses the `greeting` test id |
