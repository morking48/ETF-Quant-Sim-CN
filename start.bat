@echo off
chcp 65001 > nul
echo ========================================
echo   ETF三因子监测系统 - Web版
echo ========================================
echo.

cd /d "%~dp0"

echo [1/2] 检查Python依赖...
pip install flask flask-cors akshare > nul 2>&1
if %errorlevel% neq 0 (
    echo [警告] pip安装可能失败，请手动执行:
    echo   pip install flask flask-cors akshare
)
echo [OK] 依赖检查完成
echo.

echo [2/2] 启动后端服务...
echo   后端地址: http://localhost:5000
echo   API文档:  http://localhost:5000/api/health
echo.
echo ========================================
echo.

echo [3/3] 启动浏览器...
start "" "http://localhost:5000"

python "%~dp0backend/server.py"

pause