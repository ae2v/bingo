@echo off
setlocal EnableExtensions
title Bingo AE2V - Lancement local
cd /d "%~dp0"

echo.
echo  ========================================
echo       BINGO AE2V - LANCEMENT LOCAL
echo  ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERREUR] Node.js est introuvable.
  echo Installez Node.js 22 ou une version plus recente : https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERREUR] npm est introuvable.
  pause
  exit /b 1
)

where docker >nul 2>&1
if errorlevel 1 (
  echo [ERREUR] Docker Desktop est introuvable.
  echo Installez Docker Desktop : https://www.docker.com/products/docker-desktop/
  pause
  exit /b 1
)

docker info >nul 2>&1
if not errorlevel 1 goto docker_ready

echo [INFO] Docker n'est pas demarre. Lancement de Docker Desktop...
set "BINGO_DOCKER_EXE=C:\Program Files\Docker\Docker\Docker Desktop.exe"

if not exist "%BINGO_DOCKER_EXE%" (
  echo [ERREUR] Docker Desktop est installe, mais son executable est introuvable.
  echo Lancez Docker Desktop manuellement puis relancez ce fichier.
  pause
  exit /b 1
)

start "" "%BINGO_DOCKER_EXE%"
echo [INFO] Attente du moteur Docker ^(maximum 2 minutes^)...

set /a BINGO_DOCKER_TRIES=0
:wait_docker
ping -n 3 127.0.0.1 >nul
docker info >nul 2>&1
if not errorlevel 1 goto docker_ready
set /a BINGO_DOCKER_TRIES+=1
if %BINGO_DOCKER_TRIES% GEQ 60 (
  echo [ERREUR] Docker n'a pas demarre dans le delai prevu.
  pause
  exit /b 1
)
goto wait_docker

:docker_ready
echo [OK] Docker est disponible.

if not exist ".env" (
  echo [INFO] Creation du fichier .env local...
  copy /y ".env.example" ".env" >nul
  if errorlevel 1 goto failure
)

if not exist "node_modules\" (
  echo [INFO] Installation des dependances Node.js...
  call npm install
  if errorlevel 1 goto failure
) else (
  echo [OK] Dependances Node.js deja installees.
)

echo [INFO] Demarrage de PostgreSQL...
docker compose up -d db
if errorlevel 1 goto failure

echo [INFO] Attente de PostgreSQL...
set /a BINGO_DB_TRIES=0
:wait_database
docker compose exec -T db pg_isready -U bingo >nul 2>&1
if not errorlevel 1 goto database_ready
ping -n 2 127.0.0.1 >nul
set /a BINGO_DB_TRIES+=1
if %BINGO_DB_TRIES% GEQ 45 (
  echo [ERREUR] PostgreSQL n'est pas devenu disponible.
  goto failure
)
goto wait_database

:database_ready
echo [OK] PostgreSQL est disponible.

echo [INFO] Verification de la base de donnees...
call npm run db:migrate
if errorlevel 1 goto failure

call npm run db:seed
if errorlevel 1 goto failure

echo.
echo [INFO] Verification d'une instance deja lancee...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $web=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5173' -TimeoutSec 2; $api=Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/health' -TimeoutSec 2; if ($web.StatusCode -eq 200 -and $api.ok) { exit 0 } } catch {}; exit 1"
if not errorlevel 1 (
  echo [OK] Bingo AE2V est deja lance.
  goto app_ready
)

echo [INFO] Lancement du serveur et de l'interface...
start "Bingo AE2V - Serveurs locaux" cmd /k "cd /d ""%~dp0"" && npm run dev"

echo [INFO] Attente de l'interface Web...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddSeconds(60); do { try { $response=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5173' -TimeoutSec 2; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Milliseconds 750 } while ((Get-Date) -lt $deadline); exit 1"
if errorlevel 1 (
  echo [ATTENTION] Le serveur met plus de temps que prevu a repondre.
  echo Consultez la fenetre "Bingo AE2V - Serveurs locaux".
) else (
  echo [OK] Bingo AE2V est pret.
)

:app_ready
start "" "http://localhost:5173"
echo.
echo Joueur : http://localhost:5173
echo Admin  : http://localhost:5173/admin
echo Mot de passe local d'exemple : exemplemdp
echo.

if defined BINGO_NO_NGROK goto after_ngrok

where ngrok >nul 2>&1
if errorlevel 1 (
  echo [INFO] ngrok est introuvable dans le PATH.
  echo        Installez ngrok puis relancez ce fichier pour exposer le bingo.
  goto after_ngrok
)

echo [INFO] Lancement du tunnel ngrok vers http://localhost:5173...
start "Bingo AE2V - Tunnel ngrok" cmd /k "ngrok http 5173"

echo [INFO] Attente de l'URL publique ngrok...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddSeconds(20); do { try { $t=(Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 2).tunnels | Where-Object { $_.proto -eq 'https' } | Select-Object -First 1; if ($t.public_url) { Write-Host ('Ngrok  : ' + $t.public_url); exit 0 } } catch {}; Start-Sleep -Milliseconds 750 } while ((Get-Date) -lt $deadline); exit 1"
if errorlevel 1 (
  echo [ATTENTION] ngrok est lance mais l'URL publique n'a pas encore ete detectee.
  echo Consultez la fenetre "Bingo AE2V - Tunnel ngrok".
)
echo.

:after_ngrok
echo Pour arreter l'application, fermez la fenetre des serveurs avec Ctrl+C.
echo La base PostgreSQL restera disponible dans Docker.
echo.
if not "%BINGO_NO_PAUSE%"=="" exit /b 0
pause
exit /b 0

:failure
echo.
echo [ERREUR] Le lancement a echoue. Consultez les messages ci-dessus.
if not "%BINGO_NO_PAUSE%"=="" exit /b 1
pause
exit /b 1
