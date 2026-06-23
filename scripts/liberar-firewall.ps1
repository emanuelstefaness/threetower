<#
  Libera a porta do modo treino no Firewall do Windows (configuracao UNICA).
  Precisa rodar como Administrador (o atalho Liberar-acesso-rede.bat ja pede a permissao).
#>
param([int]$Port = 3200)

$name = "Tree Tower Treino ($Port)"
if (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue) {
  Write-Host "A porta $Port ja estava liberada. Tudo certo!" -ForegroundColor Green
} else {
  try {
    New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Any -ErrorAction Stop | Out-Null
    Write-Host "Porta $Port liberada no firewall. Pronto!" -ForegroundColor Green
  } catch {
    Write-Host "Falhou. Rode este atalho como Administrador." -ForegroundColor Red
  }
}
Write-Host ""
Write-Host "Agora abra o Treinamento.bat normalmente." -ForegroundColor Cyan
Write-Host "Os outros aparelhos (mesma rede Wi-Fi) acessam pelo IP que aparecer no Treinamento.bat."
Read-Host "Pressione ENTER para fechar"
