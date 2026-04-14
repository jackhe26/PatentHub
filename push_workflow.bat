@echo off
cd /d f:\MyAI_Labs\Patent-AI\PatentHub-main
git add .github/workflows/release.yml
git commit -m "Add release workflow for cross-platform builds"
git push origin master
