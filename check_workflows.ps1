$r = Invoke-RestMethod -Uri 'https://api.github.com/repos/jackhe26/PatentHub/git/trees/master?recursive=1'
$r.tree | Where-Object { $_.path -like "*workflow*" }
