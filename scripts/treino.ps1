<#
  Modo TREINO do Tree Tower.
  Sobe o sistema localmente com dados ISOLADOS (arquivo), usuarios de treino e
  SEM DATABASE_URL -> nunca toca o banco de dados real da empresa.

  Uso:
    npm run treino          # inicia o ambiente de treino (porta 3200)
    npm run treino:reset    # zera os dados de treino e inicia do zero

  Parametros:
    -Reset   Apaga os dados de treino (.data-treino) antes de iniciar.
    -Port    Porta (padrao 3200).
#>
param(
  [switch]$Reset,
  [int]$Port = 3200
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Aviso de seguranca: se existir .env.local com DATABASE_URL, alertar (mesmo assim forcamos arquivo).
$envLocal = Join-Path $root ".env.local"
if (Test-Path $envLocal) {
  if (Select-String -Path $envLocal -Pattern "DATABASE_URL" -Quiet) {
    Write-Host "[aviso] .env.local tem DATABASE_URL. O modo treino IGNORA isso e usa arquivo local (seguro)." -ForegroundColor Yellow
  }
}

# Reset dos dados de treino
$dataDir = Join-Path $root ".data-treino"
if ($Reset) {
  if (Test-Path $dataDir) { Remove-Item -Recurse -Force $dataDir }
  Write-Host "[treino] Dados de treino zerados." -ForegroundColor Cyan
}

# Variaveis de ambiente do modo treino
$env:DATABASE_URL = " "                      # espaco -> tratado como vazio no codigo (forca persistencia em arquivo)
$env:BUILDING_STATE_PATH = ".data-treino/building-state.json"
$env:AUTH_SECRET = "treino-secret-local-tree-tower"
$env:ADMIN_LOGIN = "juliany"
$env:APP_USERS_JSON = '[{"login":"gestor","password":"treino123","role":"gestor","name":"Gestor (treino)"},{"login":"juliany","password":"treino123","role":"gestor","name":"Juliany (admin treino)"},{"login":"secretaria","password":"treino123","role":"secretaria","name":"Secretaria (treino)"}]'

# Descobre o IP da maquina na rede local (para outros PCs/celulares acessarem).
# Prefere a placa com gateway padrao (Wi-Fi/cabo real); evita adaptadores VPN/virtuais.
$lanIp = $null
try {
  $lanIp = (Get-NetIPConfiguration -ErrorAction SilentlyContinue |
    Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq "Up" } |
    Select-Object -First 1).IPv4Address.IPAddress
} catch {}
if (-not $lanIp) {
  $lanIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -like "192.168.*" -or $_.IPAddress -like "10.*" -or $_.IPAddress -like "172.*" } |
    Select-Object -First 1).IPAddress
}
if (-not $lanIp) { $lanIp = "SEU_IP" }

Write-Host ""
Write-Host "==================== MODO TREINO ====================" -ForegroundColor Green
Write-Host "  Neste computador:   http://localhost:$Port" -ForegroundColor White
Write-Host "  Outros aparelhos:   http://${lanIp}:$Port   (mesma rede Wi-Fi)" -ForegroundColor Cyan
Write-Host "  Logins (senha treino123): secretaria | gestor | juliany (admin)" -ForegroundColor White
Write-Host "  Dados: arquivo local (.data-treino) - NAO toca o banco real." -ForegroundColor White
Write-Host "  Se o Windows perguntar, clique em PERMITIR ACESSO (firewall)." -ForegroundColor Yellow
Write-Host "  Parar: Ctrl + C" -ForegroundColor DarkGray
Write-Host "====================================================" -ForegroundColor Green
Write-Host ""

# Porta via env; -H 0.0.0.0 expoe na rede (outros aparelhos acessam pelo IP).
$env:PORT = "$Port"
npm run dev -- -H 0.0.0.0
