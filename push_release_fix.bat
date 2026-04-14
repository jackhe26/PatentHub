@echo off
cd /d f:\MyAI_Labs\Patent-AI\PatentHub-main
git add electron-builder.yml .github/workflows/release.yml
git commit -m "Fix: separate mac arch builds and add GitHub Release"
git push origin master
