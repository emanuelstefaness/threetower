# Deploy na Oracle Cloud (Always Free) — passo a passo

Este documento é um guia **específico** para subir o projeto **3tower** (Next.js + Docker + PostgreSQL) na **Oracle Cloud Infrastructure (OCI)**, usando em princípio recursos **Always Free** (tier gratuito com limites). O teu PC pode ser **Windows**; só precisas de **navegador** e, depois, **SSH** (PowerShell ou PuTTY).

Para conceitos gerais (o que é `web` vs `db`, `.env`, HTTPS), vê também [DEPLOY.md](./DEPLOY.md).

---

## O que vais precisar

- Conta na Oracle Cloud (cartão para **verificação**; consulta as regras atuais no site da Oracle).
- Região recomendada: **Brazil East (São Paulo)** — menor latência no Brasil.
- Forma **Always Free** típica: **Ampere A1 (ARM)** com Ubuntu — o `docker build` do Next.js funciona em ARM (o Dockerfile usa `node:20-alpine`, que tem imagem multi-arquitetura).

---

## Parte A — Criar conta e instância

### 1. Registo

1. Acede a [https://www.oracle.com/cloud/free/](https://www.oracle.com/cloud/free/) e cria uma conta **Cloud Free Tier**.
2. Completa a verificação (email, dados, cartão se pedido).

### 2. Entrar na consola

1. Abre [https://cloud.oracle.com](https://cloud.oracle.com) e faz login.
2. No canto superior, confirma a **região** (ex.: **Sao Paulo**).

### 3. Rede (VCN) — se ainda não existir

1. Menu ☰ → **Networking** → **Virtual cloud networks** (ou procura “VCN”).
2. Se não houver rede, **Create VCN** e usa o **wizard** “Start with VCN and more” (cria subnet pública, gateway de Internet, regras básicas). Anota o nome da subnet **pública**.

### 4. Regras de firewall da subnet (Security List)

A VM precisa de portas abertas **de entrada** (ingress):

1. Na VCN → **Security Lists** → lista default da subnet pública → **Add Ingress Rules**:
   - **SSH:** TCP **22**, origem `0.0.0.0/0` (ou só o teu IP /32 para mais segurança).
   - **HTTP:** TCP **80**, origem `0.0.0.0/0`.
   - **HTTPS:** TCP **443**, origem `0.0.0.0/0`.
   - (Opcional para testes) **App:** TCP **3000**, origem `0.0.0.0/0` — só se quiseres testar sem proxy; em produção usa 80/443 com Caddy/Nginx.

**Não** abras a porta **5432** (Postgres) para a Internet; o Postgres corre só dentro do Docker.

### 5. Chave SSH (no Windows, antes de criar a VM)

No **PowerShell**:

```powershell
ssh-keygen -t rsa -b 4096 -f $env:USERPROFILE\.ssh\oracle_3tower -N '""'
```

Abre o ficheiro `oracle_3tower.pub` com o Notepad e **copia** a linha inteira (começa com `ssh-rsa`). Vais colar na Oracle ao criar a instância.

### 6. Criar a instância (Compute)

1. Menu ☰ → **Compute** → **Instances** → **Create instance**.
2. **Name:** ex. `3tower-server`.
3. **Placement:** mantém a **Availability domain** que a consola sugerir (compatível com Always Free).
4. **Image:** **Change image** → **Canonical Ubuntu** → **Ubuntu 22.04** (ou 24.04 se disponível).
5. **Shape:** escolhe **Ampere** / **VM.Standard.A1.Flex** (Always Free eligible):
   - Para free tier costuma dar para **até 4 OCPUs e 24 GB RAM** no total da conta; para **uma** VM pequena usa por exemplo **1 OCPU** e **6 GB RAM** (ajusta ao que o painel permitir “Always Free”).
   - Se A1 não estiver disponível na região, vê alternativas **E2 Micro** (AMD) se aparecerem como Always Free — também servem com menos RAM (pode apertar no `docker build`).
6. **Networking:** VCN e **subnet pública** criadas antes.
7. **Primary VNIC:** marca **Assign public IPv4 address** (ou associa um **Reserved public IP** depois, se o IP mudar ao reiniciar).
8. **Add SSH keys:** cola a chave **pública** (`oracle_3tower.pub`).
9. **Create**.

Aguarda o estado **RUNNING** e anota o **Public IP address**.

### 7. Ligar por SSH (Windows)

No PowerShell (ajusta o caminho da chave e o IP):

```powershell
ssh -i $env:USERPROFILE\.ssh\oracle_3tower ubuntu@IP_PUBLICO
```

Na Oracle Ubuntu, o utilizador por defeito costuma ser **`ubuntu`** (não `root`). Para comandos de admin:

```bash
sudo -i
```

---

## Parte B — Ubuntu, Docker e projeto (igual ao DEPLOY.md)

### 8. Atualizar sistema e instalar Docker

```bash
sudo apt update && sudo apt upgrade -y
```

Instalação Docker (Ubuntu — igual ao [DEPLOY.md](./DEPLOY.md)):

```bash
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${VERSION_CODENAME:-$VERSION}") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu
```

**Termina a sessão SSH e volta a entrar** para o grupo `docker` aplicar. Depois testa:

```bash
docker --version
docker compose version
```

### 9. Firewall local (UFW) — opcional mas útil

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp
sudo ufw enable
```

(A Oracle também filtra na **Security List**; os dois níveis devem permitir o mesmo.)

### 10. Clonar o projeto e `.env`

```bash
sudo mkdir -p /opt && sudo chown ubuntu:ubuntu /opt
cd /opt
git clone https://github.com/TEU_USUARIO/3tower.git
cd 3tower
cp .env.example .env
nano .env
```

Preenche **pelo menos** `POSTGRES_PASSWORD`, `AUTH_SECRET`, `APP_LOGIN_PASSWORD` (valores fortes). Guarda com `Ctrl+O`, Enter, `Ctrl+X`.

### 11. Subir Docker Compose

```bash
cd /opt/3tower
docker compose up -d --build
```

O primeiro **build** em ARM pode demorar vários minutos. Verifica:

```bash
docker compose ps
docker compose logs -f web
```

Testa no browser: `http://IP_PUBLICO:3000`.

### 12. HTTPS e domínio (recomendado)

1. Aponta o teu domínio (registo **A**) para o **IP público** da instância.
2. Na VM, instala **Caddy** ou **Nginx** e faz `reverse_proxy` para `127.0.0.1:3000` (exemplo de Caddyfile no [DEPLOY.md](./DEPLOY.md)).

---

## Parte C — Manutenção e limitações Oracle

### Atualizar a aplicação

```bash
cd /opt/3tower
git pull
docker compose up -d --build
```

### Backup da base

```bash
cd /opt/3tower
docker compose exec -T db pg_dump -U tower tower > backup-$(date +%F).sql
```

(Ajusta `-U` e nome da base se mudaste no `.env`.)

### Limitações e avisos

- **Always Free** tem **cotas**; se excederes, a Oracle pode pedir upgrade pago.
- **IP público** pode mudar se não usares **Reserved Public IP** (em **Networking** → **Reserved public IPs** associa à instância).
- Conta **inativa** por muito tempo pode ser afetada pelas políticas da Oracle — consulta os termos atuais.
- **Suporte** gratuito é limitado; para produção crítica considera documentar backups e um plano B.

---

## Resumo dos comandos (cola útil)

```text
# Windows (PowerShell)
ssh -i $env:USERPROFILE\.ssh\oracle_3tower ubuntu@IP_PUBLICO

# Na VM
cd /opt/3tower && docker compose up -d --build && docker compose ps
```

---

## Referência cruzada

- Guia genérico (qualquer VPS): [DEPLOY.md](./DEPLOY.md)
- Variáveis de ambiente: [.env.example](./.env.example)
