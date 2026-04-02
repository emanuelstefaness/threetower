# Deploy: front, API e base de dados

## Guia passo a passo: VPS + Docker (site + PostgreSQL)

Objetivo: ter o projeto **online** num servidor na cloud — **Docker** com dois serviços (**`web`** = Next.js com páginas e APIs; **`db`** = PostgreSQL com dados persistentes). O **teu PC não precisa de ficar ligado** depois disto.

### O que obténs no fim

- Acesso por `https://teu-dominio` (ou `http://IP:3000` enquanto testas).
- **Login** se `AUTH_SECRET` estiver no `.env`.
- Dados do prédio na base **PostgreSQL** (volume `pgdata` no VPS).

---

### Onde podes hospedar (lista do que **serve** para este projeto)

**Requisito:** tens de ter **root/sudo em Linux** (idealmente **Ubuntu 22.04 ou 24.04**) para instalar **Docker**. Serve: **VPS**, **cloud server**, **máquina virtual** com Linux.

**Não serve:** “hospedagem compartilhada”, “hospedagem só PHP/WordPress”, “painel cPanel sem VPS”, “apenas FTP” — nesses não consegues seguir este guia.

#### Marcas no Brasil (costumam ter VPS/cloud Linux — confirma no site o produto exato)

| Marca | O que procurar no site (nome do tipo de produto) |
|-------|---------------------------------------------------|
| **Locaweb** | Cloud Server / servidor cloud com **Linux** e escolha de SO |
| **KingHost** | **VPS** (Linux) |
| **HostGator Brasil** | **VPS** (não o plano “hospedagem” básica) |
| **UOL Host** | Cloud / servidor **VPS** ou dedicado virtual **Linux** |
| **Hostinger** (Brasil) | **VPS** KVM com Ubuntu |

#### Internacional (mesmo guia Docker; muitas com datacenter em **São Paulo**)

| Marca | Produto típico |
|-------|------------------|
| **DigitalOcean** | Droplet (Ubuntu) |
| **Hetzner** | Cloud (CX/CPX, Ubuntu) |
| **Contabo** | VPS (Ubuntu) |
| **Vultr** | Cloud Compute |
| **Linode (Akamai)** | Shared CPU / Dedicated |
| **AWS** | Lightsail ou EC2 (Ubuntu) |
| **Google Cloud** | Compute Engine (VM pequena) |
| **Oracle Cloud** | Always Free ARM/x86, região **São Paulo** (testes) — **guia dedicado:** [DEPLOY-ORACLE-CLOUD.md](./DEPLOY-ORACLE-CLOUD.md) |
| **OVH / Scaleway** | VPS / instance Linux |

Antes de pagar: confirma que podes **aceder por SSH** como `root` ou `ubuntu` e escolher **Ubuntu** na instalação.

---

### 1. Contratar um VPS

1. Escolhe um fornecedor da tabela acima (ou outro que ofereça **VPS Linux com Ubuntu**).
2. Cria uma VM **Ubuntu 22.04 ou 24.04 LTS** com pelo menos **1–2 GB RAM**.
3. Anota o **IP público**.
4. No painel da cloud (**firewall / security group**), permite **entrada**: **TCP 22** (SSH), **TCP 80** e **TCP 443** (site). **Não** abras **5432** à Internet.

---

### 2. Ligar ao servidor (SSH)

No teu PC:

```bash
ssh root@IP_DO_SERVIDOR
```

(Substitui pelo IP real; se o utilizador for `ubuntu`, usa `ssh ubuntu@IP`.)

---

### 3. Atualizar o sistema e instalar Docker

```bash
apt update && apt upgrade -y
```

Instalação Docker em Ubuntu (se algo falhar, segue a [documentação oficial](https://docs.docker.com/engine/install/ubuntu/)):

```bash
apt install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${VERSION_CODENAME:-$VERSION}") stable" > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
docker --version
docker compose version
```

---

### 4. Firewall no servidor (recomendado)

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

Para testar **sem** HTTPS diretamente em `http://IP:3000`, podes abrir temporariamente `ufw allow 3000/tcp` e fechar depois.

---

### 5. Colocar o projeto no VPS

Com Git:

```bash
cd /opt
git clone https://github.com/TEU_USUARIO/3tower.git
cd 3tower
```

Sem Git: envia a pasta do projeto por **SFTP/WinSCP** para `/opt/3tower` (deve conter `Dockerfile` e `docker-compose.yml` na raiz).

---

### 6. Ficheiro `.env`

```bash
cd /opt/3tower
cp .env.example .env
nano .env
```

**Obrigatório preencher** (com valores teus, fortes):

| Variável | Função |
|----------|--------|
| `POSTGRES_PASSWORD` | Palavra-passe do Postgres **dentro** do Docker (só a app liga). |
| `AUTH_SECRET` | Segredo longo para login em produção. **Sem isto não há ecrã de login.** |
| `APP_LOGIN_PASSWORD` | Palavra-passe dos **editores** no formulário de login. |

Exemplo de estrutura (inventa passwords reais fortes):

```env
POSTGRES_PASSWORD=senha_forte_postgres
POSTGRES_USER=tower
POSTGRES_DB=tower
WEB_PORT=3000

AUTH_SECRET=cadeia_aleatoria_longa_minimo_32_caracteres
APP_LOGIN_PASSWORD=senha_dos_editores
```

Guarda o ficheiro. **Nunca** commites o `.env`.

---

### 7. Subir `db` + `web` e o que acontece

- **`db`**: PostgreSQL 16; dados no volume **`pgdata`** (persistem após reinício).
- **`web`**: constrói a imagem do `Dockerfile` e recebe `DATABASE_URL` para `db:5432`. A app cria a tabela `building_state` quando precisa.

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f web
```

Testa no browser: `http://IP:3000` — deve aparecer **login** se `AUTH_SECRET` estiver definido.

---

### 8. Domínio e HTTPS

1. No DNS, registo **A** (ou **AAAA**) → IP do VPS.
2. Instala **Caddy** (certificados automáticos) ou **Nginx** com TLS.

Exemplo **Caddyfile** (`/etc/caddy/Caddyfile`), substituindo o domínio:

```text
teu-dominio.com.br {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
systemctl reload caddy
```

Partilha o site em **https://…**

---

### 9. Atualizar o código depois

```bash
cd /opt/3tower
git pull
docker compose up -d --build
```

---

### 10. Backup da base

```bash
cd /opt/3tower
docker compose exec -T db pg_dump -U tower tower > backup-$(date +%F).sql
```

(Ajusta `-U` e nome da base se mudaste no `.env`.)

---

### Resumo de comandos úteis

```bash
ssh root@IP
cd /opt/3tower
nano .env
docker compose up -d --build
docker compose ps
docker compose logs -f web
```

---

### Alternativa sem Docker no servidor

1. Node.js 20+ e PostgreSQL no mesmo host (ou Postgres gerido).
2. `DATABASE_URL`, `AUTH_SECRET`, `APP_LOGIN_PASSWORD`, `NODE_ENV=production`.
3. `npm ci && npm run build && npm run start` com **systemd** ou **PM2**; HTTPS com Caddy/Nginx.

---

## Arquitetura

- **Next.js** serve a interface e as rotas `/api/*` (não há backend separado).
- **PostgreSQL** guarda o estado do prédio em JSONB (`building_state`), quando `DATABASE_URL` está definido.
- Sem `DATABASE_URL`, o estado continua no **ficheiro JSON** (`BUILDING_STATE_PATH` ou `.data/building-state.json`).

## Docker Compose (recomendado)

1. Copie `.env.example` para `.env`.
2. Defina **`POSTGRES_PASSWORD`** com uma palavra-passe forte e **única**. Não a partilhe em repositórios, tickets nem chats.
3. Na raiz do projeto:

```bash
docker compose up -d --build
```

4. A aplicação fica em `http://localhost:3000` (ou `WEB_PORT` no `.env`).

**Persistência:** o volume Docker `pgdata` mantém os dados da base entre reinícios. Faça **backups** desse volume ou dumps (`pg_dump`) com a mesma confidencialidade que os dados de negócio.

**Rede:** o serviço `db` **não publica** a porta 5432 para o anfitrião; só o contentor `web` liga à base na rede interna. Isto reduz exposição acidental da base na Internet.

## Login (`/login`)

- **Desenvolvimento (`npm run dev`):** se **`AUTH_SECRET`** não estiver definido, a app usa um segredo local fixo — o middleware manda para **`/login`** antes do dashboard. Para abrir direto o dashboard em dev, defina **`DISABLE_AUTH=1`** no `.env.local`.
- **Reinício do `npm run dev`:** o cookie antigo deixa de ser aceite (o JWT inclui o ID deste arranque do servidor); é preciso voltar a entrar. Isto só aplica em desenvolvimento; em produção a sessão continua válida até expirar (7 dias) ou **Sair**.
- **Produção (`next start` / Docker):** o login só está ativo se **`AUTH_SECRET`** estiver definido (valor forte). Sem isso, a app fica acessível sem ecrã de login.
- **Visualizador:** **«Acessar como visualizador»** (sem palavra-passe) — só leitura nas mutações.
- **Editor:** **«Entrar com palavra-passe»** — requer **`APP_LOGIN_PASSWORD`** definido.

## Visualização vs edição (`APP_MODE`)

Não existe rota tipo `/ver` ou `/editar` na mesma app: **cada instância** do servidor está em **só leitura** ou em **edição**, consoante o ambiente.

| Quem | Como aceder | Configuração |
|------|----------------|----------------|
| **Só visualiza** | URL da instância onde `APP_MODE=view` | UI sem alterações; APIs de mutação respondem **403**. |
| **Edita** | URL da instância **sem** `APP_MODE=view` (ou outro valor) | Comportamento normal de edição. |

Na prática: **duas URLs** = **dois deploys** (ou dois contentores) com o **mesmo** `DATABASE_URL` para partilharem dados, mas um com `APP_MODE=view` e o outro sem. Exemplos: `https://tower.seudominio.com` (edição, rede restrita) e `https://tower-view.seudominio.com` (só leitura, público interno).

Valores que ativam só leitura: `view`, `readonly`, `read-only` (ver `src/lib/appMode.ts`).

## Variáveis de ambiente

| Variável | Significado |
|----------|-------------|
| `AUTH_SECRET` | Produção: exige login. Dev: opcional (há segredo local por defeito). |
| `DISABLE_AUTH` | Só dev: `1` ou `true` desliga login e abre o dashboard direto. |
| `APP_LOGIN_PASSWORD` | Palavra-passe do papel **editor** (login com formulário). |
| `APP_MODE` | `view` / `readonly` / `read-only` → só visualização; caso contrário → edição. |
| `DATABASE_URL` | Ligação PostgreSQL. Se existir, usa a base em vez do JSON. |
| `BUILDING_STATE_PATH` | Caminho do JSON quando **não** há `DATABASE_URL`. |
| `BUILDING_PERSISTENCE` | `0` / `false` / `off` desativa leitura e gravação. |
| `POSTGRES_*` / `WEB_PORT` | Usadas pelo `docker-compose.yml` (ver `.env.example`). |

Se a palavra-passe da base tiver caracteres especiais (`@`, `:`, etc.), use-os **codificados** na URL ou escolha uma palavra-passe sem esses caracteres.

## Dados sensíveis

- **Nunca** commite `.env` (está no `.gitignore`).
- Trate `DATABASE_URL` e `POSTGRES_PASSWORD` como segredos: gestor de secrets na cloud, cofre, ou ficheiro só no servidor.
- O código **não** regista o conteúdo do estado nas queries nem em logs de persistência.
- A API continua acessível a quem alcança a URL da app; para dados de extrema importância, acrescente **autenticação**, HTTPS e políticas de rede (VPN, IP allowlist) à frente do serviço.

## Onde não usar só ficheiro

- **Vercel / serverless puro:** sistema de ficheiros efémero. Use PostgreSQL gerido (Neon, Supabase, RDS, etc.) com `DATABASE_URL` ou um contentor sempre ligado com volume/Compose.

## Hospedagem gratuita para testar

| Opção | O que é | Encaixa no teu projeto? |
|-------|---------|-------------------------|
| **[Oracle Cloud Always Free](https://www.oracle.com/cloud/free/)** | VPS Linux (ex. São Paulo) onde corres **Docker + Compose** como no guia. | **Sim** — é o mais completo para testar **app + Postgres** sem cartão extra além da verificação. Guia: [DEPLOY-ORACLE-CLOUD.md](./DEPLOY-ORACLE-CLOUD.md). |
| **[Railway](https://railway.app)** / **[Render](https://render.com)** | Créditos ou plano free limitado; serviço **Web** + **Postgres** gerido. | **Possível**, mas tens de adaptar: Dockerfile ou build Node, variáveis `DATABASE_URL`, etc. (não é copiar-colar do Compose sem ler a doc deles). |
| **[Fly.io](https://fly.io)** | Tier gratuito com limites; suporta `fly launch` + Postgres. | **Possível** com configuração própria (não está pronto no repo). |
| **Postgres gerido** + **[Vercel](https://vercel.com)** | [Neon](https://neon.tech), [Supabase](https://supabase.com), [Render](https://render.com), etc. | **Vercel + Neon (completo):** [DEPLOY-VERCEL-NEON.md](./DEPLOY-VERCEL-NEON.md) · **Geral:** [DEPLOY-VERCEL-SUPABASE.md](./DEPLOY-VERCEL-SUPABASE.md) |
| **Túnel (PC ligado)** | [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/) ou [ngrok](https://ngrok.com) expõe o teu `localhost:3000`. | **Grátis** para mostrar a alguém **enquanto o teu PC e `npm run dev` estão ligados** — não é hospedagem 24h. |

Para **testar o mesmo stack que em produção** (Docker + Postgres no mesmo sítio), o caminho mais direto em **grátis** costuma ser **Oracle Cloud** com o passo a passo dedicado.

## Resumo

1. Em produção com Docker: `docker compose up` + `.env` com `POSTGRES_PASSWORD` forte.
2. Com base: `DATABASE_URL` aponta para Postgres persistente.
3. Sem base: volume ou disco + `BUILDING_STATE_PATH`.
4. Backups e segredos fora do Git.
