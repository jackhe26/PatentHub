@echo off
set /p TOKEN=<token.txt
"C:\Program Files\GitHub CLI\gh.exe" auth login --with-token
