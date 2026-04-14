@echo off
cd /d f:\MyAI_Labs\Patent-AI\PatentHub-main
git add .github/workflows/release.yml
git commit -m "Fix: simplify Linux build command"
git push origin master
