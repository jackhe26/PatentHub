@echo off
cd /d f:\MyAI_Labs\Patent-AI\PatentHub-main
rmdir /s /q .git
git init
git add .
git commit -m "Initial commit - PatentHub project"
