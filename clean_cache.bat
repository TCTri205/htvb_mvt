@echo off
echo =========================================
echo Cleaning Python Cache and Compiled Files
echo =========================================
echo.

cd /d d:\Projects_IT\htvb_mvt\backend

echo [1/10] Deleting __pycache__ directories...
for /d /r %%d in (__pycache__) do @if exist "%%d" rd /s /q "%%d" 2>nul
echo Done.

echo [2/10] Deleting .pyc files...
del /s /q *.pyc 2>nul
echo Done.

echo.
echo =========================================
echo Section 1: Cache cleaning completed!
echo =========================================
pause
