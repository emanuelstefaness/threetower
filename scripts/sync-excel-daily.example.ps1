# Exemplo: Agendador de Tarefas do Windows — enviar planilha local para o site todos os dias.
#
# 1. Copia para sync-excel-daily.ps1 e edita as variáveis (não commites segredos).
# 2. Agendador de Tarefas → nova tarefa → Disparador diário → Ação:
#    Programa: powershell.exe
#    Argumentos: -NoProfile -ExecutionPolicy Bypass -File "C:\caminho\completo\sync-excel-daily.ps1"
#
# Servidor: EXCEL_SYNC_SECRET + persistência (DATABASE_URL ou BUILDING_STATE_PATH).
# Formato Excel: igual ao script import-tree-tower-seed.mjs (cabeçalhos na linha 2).

$ExcelPath = "C:\Users\TU\Documents\Salas Tree Tower.xlsx"
$BaseUrl = "https://teu-dominio.vercel.app"
$Secret = "o-mesmo-valor-que-EXCEL_SYNC_SECRET-no-servidor"

if (-not (Test-Path -LiteralPath $ExcelPath)) {
  Write-Error "Ficheiro nao encontrado: $ExcelPath"
  exit 1
}

$uri = "$BaseUrl/api/admin/sync-excel"
# curl.exe no Windows 10/11; -f falha com exit code != 0 em 4xx/5xx
& curl.exe -f -s -S -X POST $uri `
  -H "Authorization: Bearer $Secret" `
  -F "file=@$ExcelPath"
if ($LASTEXITCODE -ne 0) {
  Write-Error "Falha ao sincronizar (curl exit $LASTEXITCODE)"
  exit 1
}
Write-Host "Sincronizacao concluida."
