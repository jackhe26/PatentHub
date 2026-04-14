@echo off
set GH_TOKEN=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
"C:\Program Files\GitHub CLI\gh.exe" workflow run release.yml -f version_type=patch
