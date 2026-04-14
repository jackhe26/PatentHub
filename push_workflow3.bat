@echo off
cd /d f:\MyAI_Labs\Patent-AI\PatentHub-main
git add .github/workflows/release.yml
git commit -m "Fix: add build step before electron-builder"
git push origin master
