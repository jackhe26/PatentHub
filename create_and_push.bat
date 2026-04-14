@echo off
set GH_TOKEN=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
cd /d f:\MyAI_Labs\Patent-AI\PatentHub-main
"C:\Program Files\GitHub CLI\gh.exe" repo create PatentHub --public --source=. --push
