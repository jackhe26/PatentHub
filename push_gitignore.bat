@echo off
cd /d f:\MyAI_Labs\Patent-AI\PatentHub-main
git add .gitignore release/app/package.json release/app/package-lock.json
git commit -m "Fix: include release/app/package.json in git"
git push origin master
