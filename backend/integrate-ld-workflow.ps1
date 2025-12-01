# Script to integrate workflow functions into LD JS file
# Run this in PowerShell from backend directory

Write-Host "Step 1: Restoring clean version..." -ForegroundColor Yellow
git checkout HEAD -- static/js/lanhdao-hosocongviec-detail.js

Write-Host "Step 2: Reading files..." -ForegroundColor Yellow
$main = Get-Content static/js/lanhdao-hosocongviec-detail.js -Raw
$addon = Get-Content static/js/_ld_workflow_addon.js -Raw

Write-Host "Step 3: Removing closing })(); from main file..." -ForegroundColor Yellow
$main = $main -replace '\}\)\(\);[\r\n]*$', ''

Write-Host "Step 4: Combining files..." -ForegroundColor Yellow
$combined = $main + "`n" + $addon + "`n})();"

Write-Host "Step 5: Writing combined file..." -ForegroundColor Yellow
Set-Content static/js/lanhdao-hosocongviec-detail.js $combined

Write-Host "Done! File integrated successfully." -ForegroundColor Green
Write-Host "You can now delete static/js/_ld_workflow_addon.js" -ForegroundColor Cyan
