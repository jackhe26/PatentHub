@echo off
cd /d f:\MyAI_Labs\Patent-AI\PatentHub-main
del /q check_files.bat create_repo.bat list_workflow.bat run_workflow.bat token.txt 2>nul
del /q push.bat push2.bat push_ssh.bat ssh_push.bat gh_check.bat gh_list_repos.bat run_push.bat final_push.bat 2>nul
