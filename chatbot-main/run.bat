@echo off
echo ========================================
echo   RAG CHATBOT - Quick Start
echo ========================================
echo.

echo [1/3] Checking Python...
python --version
if errorlevel 1 (
    echo ERROR: Python not found! Please install Python first.
    pause
    exit /b 1
)
echo.

echo [2/3] Checking dependencies...
python -c "import flask" 2>nul
if errorlevel 1 (
    echo Installing dependencies...
    pip install -r requirements.txt
    pip install "unstructured[pdf]"
) else (
    echo Dependencies OK!
)
echo.

echo [3/3] Checking .env file...
if not exist .env (
    echo WARNING: .env file not found!
    echo Please create .env file with: GROQ_API_KEY=your_key_here
    echo.
    pause
)
echo.

echo ========================================
echo   Starting Flask application...
echo   Open browser: http://localhost:5000
echo ========================================
echo.
echo Press Ctrl+C to stop the server
echo.

python appchatbot.py

pause

