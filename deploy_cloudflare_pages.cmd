@echo off
setlocal

cd /d "%~dp0"

if "%CLOUDFLARE_API_TOKEN%"=="" (
  echo CLOUDFLARE_API_TOKEN is not set.
  echo Create a Cloudflare API token with Pages edit permission, then run:
  echo set CLOUDFLARE_API_TOKEN=your_token_here
  echo deploy_cloudflare_pages.cmd
  exit /b 1
)

python generate_daily_market_digest.py
if errorlevel 1 exit /b 1

python generate_static_reports.py
if errorlevel 1 exit /b 1

npx.cmd wrangler pages deploy . --project-name dotori-stock --commit-dirty=true
exit /b %errorlevel%
