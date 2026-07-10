@echo off
setlocal
set "SUPABASE_ACCESS_TOKEN="
set "TOKFILE=%~dp0supabase-token.txt"
if exist "%TOKFILE%" set /p SUPABASE_ACCESS_TOKEN=<"%TOKFILE%"
npx -y @supabase/mcp-server-supabase@latest --read-only --project-ref=ifrydgoofjalfufcpxka