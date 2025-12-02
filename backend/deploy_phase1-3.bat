@echo off
REM Deployment script for Phase 1-3 Outbound Workflow Refinements
REM Date: 2025-12-02

echo ========================================
echo Outbound Workflow Deployment - Phase 1-3
echo ========================================
echo.

REM Check if in backend directory
if not exist "manage.py" (
    echo ERROR: Please run this script from the backend directory
    echo Current directory: %cd%
    pause
    exit /b 1
)

echo Step 1: Creating migrations...
python manage.py makemigrations documents
if errorlevel 1 (
    echo ERROR: makemigrations failed
    pause
    exit /b 1
)

echo.
echo Step 2: Running migrations...
python manage.py migrate documents
if errorlevel 1 (
    echo ERROR: migrate failed
    pause
    exit /b 1
)

echo.
echo Step 3: Verifying MANUAL_LOG action...
python -c "from documents.models import DocumentWorkflowLog; print('✓ MANUAL_LOG action verified:', DocumentWorkflowLog.Action.MANUAL_LOG)"
if errorlevel 1 (
    echo WARNING: Could not verify MANUAL_LOG action
)

echo.
echo ========================================
echo Migration Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Run: python manage.py runserver
echo 2. Test features per walkthrough.md
echo 3. Check browser console for errors
echo.
echo Press any key to start dev server...
pause >nul

python manage.py runserver
