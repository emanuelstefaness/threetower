# Passo a passo completo: Vercel + Neon

Guia para publicar o projeto **threetower** (Next.js) na **[Vercel](https://vercel.com)** com base de dados **[Neon](https://neon.tech)** (PostgreSQL). Não precisas de VPS nem Docker.

**Pré-requisitos:** conta **GitHub** com o código do projeto (ex.: [emanuelstefaness/threetower](https://github.com/emanuelstefaness/threetower)).

---

## Parte 1 — Criar projeto e base no Neon

### 1.1 Conta

1. Abre [https://neon.tech](https://neon.tech).
2. Clica em **Sign up** e regista-te (recomendado: **Continue with GitHub**).

### 1.2 Novo projeto

1. No painel, clica em **Create a project** (ou **New Project**).
2. **Name:** ex. `threetower` (ou o nome que quiseres).
3. **Region:** escolhe a mais próxima dos teus utilizadores (ex.: **South America (São Paulo)** se existir na lista; senão **US East** ou **EU**).
4. **Postgres version:** mantém a sugerida (ex. 16).
5. Confirma a criação.

### 1.3 Palavra-passe da base

- Na criação, o Neon mostra ou gera uma **password** para o utilizador `neondb_owner` (ou similar).  
- **Guarda-a** num gestor de passwords — vais precisar dela na connection string.  
- Se perderes: no painel do projeto → **Dashboard** → **Reset password** (ou equivalente).

### 1.4 Obter a connection string (importante para Vercel)

1. No projeto Neon, abre **Dashboard** (ou **Connection details**).
2. Procura **Connection string** / **Connect to your database**.
3. Escolhe o modo **Pooled** / **Connection pooling** / **Serverless** (nomes podem variar no painel).  
   - **Porquê:** a Vercel corre muitas funções em paralelo; a ligação **direta** esgota rápido o limite de conexões do Postgres. O **pooler** do Neon evita o erro *“too many connections”*.
4. Formato típico (exemplo genérico, o teu será parecido):
   ```text
  postgresql://neondb_owner:npg_zdQPqY3RLr6w@ep-wild-base-ac13nk45-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```
5. Clica em **Copy** na URI completa.  
6. Se a string tiver `[YOUR-PASSWORD]` ou placeholder, substitui pela **password** real da base (sem espaços no início/fim).

**Não partilhes** esta URL em repositórios públicos nem em chats.

---

## Parte 2 — Publicar na Vercel

### 2.1 Conta e novo projeto

1. Abre [https://vercel.com](https://vercel.com) e faz login (idealmente com o **mesmo GitHub**).
2. **Add New…** → **Project**.
3. Em **Import Git Repository**, localiza **`emanuelstefaness/threetower`** (ou **Configure GitHub** e autoriza o acesso ao repo se for a primeira vez).
4. Clica **Import** ao lado do repositório.

### 2.2 Configuração do build

1. **Framework Preset:** deve aparecer **Next.js** (automático).
2. **Root Directory:** `./` (raiz).
3. **Build Command:** `npm run build` (predefinição).
4. **Output Directory:** deixa em branco / predefinição (a Vercel trata do Next.js).

Não alteres nada crítico aqui salvo saberes o que fazes.

### 2.3 Variáveis de ambiente (obrigatório)

Antes de clicar em **Deploy**, expande **Environment Variables** e adiciona **uma linha por variável** (marca **Production**, e opcionalmente **Preview** / **Development** se quiseres):

| Name | Value | Notas |
|------|--------|--------|
| `DATABASE_URL` | Cola a **connection string pooled** completa do Neon (parte 1.4). | Sem aspas. |
| `AUTH_SECRET` | Uma cadeia longa e aleatória (mín. ~32 caracteres). | Ex.: gera no PowerShell: `[Convert]::ToBase64String((1..32|%{Get-Random -Max 256})|%{[byte]$_})` ou usa um gerador de passwords. |
| `APP_LOGIN_PASSWORD` | Palavra-passe que os **editores** vão usar no login (campo “Entrar com palavra-passe”). | Define tu. |

Opcional:

| Name | Value |
|------|--------|
| `APP_MODE` | `view` — se quiseres **só leitura** neste deploy. |

Confirma que **não** há espaços a mais antes/depois dos valores.

### 2.4 Deploy

1. Clica **Deploy**.
2. Espera o **build** (pode levar 2–5 minutos na primeira vez).
3. Se falhar, abre o **log** do build e procura erros (frequentemente: `DATABASE_URL` mal copiada ou variável em falta).

### 2.5 URL do site

- No fim, a Vercel mostra algo como `https://threetower-xxx.vercel.app`.  
- Esse é o endereço público da app.

---

## Parte 3 — Testar

1. Abre o URL da Vercel no browser.
2. Deves ver a página de **login** (porque `AUTH_SECRET` está definido em produção).
3. Testa **«Acessar como visualizador»** ou login com **palavra-passe** (`APP_LOGIN_PASSWORD`).
4. Navega pelo dashboard; altera algo; recarrega — os dados devem **persistir** (estão no Neon).

### Ver dados no Neon (opcional)

1. No painel Neon → **SQL Editor** (ou **Tables**).
2. Executa:
   ```sql
   SELECT id, updated_at FROM building_state;
   ```
3. Deves ver a linha `id = 1` quando a app já gravou estado.

---

## Parte 4 — Atualizar o código depois

1. No teu PC: alteras o código, **commit** e **`git push`** para o `main` (ou branch ligada à Vercel).
2. A Vercel faz **deploy automático** (por defeito).
3. Se mudares **só** variáveis no painel: **Redeploy** manual em **Deployments** → **⋯** → **Redeploy**.

---

## Parte 5 — Domínio próprio (opcional)

1. Na Vercel: **Project** → **Settings** → **Domains**.
2. Adiciona o teu domínio (ex. `torre.teudominio.com`).
3. Segue as instruções de **DNS** (registo **CNAME** ou **A** que a Vercel indicar).

---

## Problemas frequentes

| Sintoma | O que verificar |
|---------|------------------|
| Build OK mas app dá erro ao carregar | `DATABASE_URL` na Vercel (Production) está correta? Password com caracteres especiais pode precisar de **URL encoding** na string. |
| *Too many connections* | Usa a string **Pooled** do Neon, não só a ligação **direct**. |
| Sem página de login | `AUTH_SECRET` vazio ou não definido em **Production**. |
| SSE / tempo real desliga rápido | Limites do plano **Hobby** da Vercel; com poucos utilizadores pode ser aceitável. Ver também [DEPLOY-VERCEL-SUPABASE.md](./DEPLOY-VERCEL-SUPABASE.md) secção de limitações. |
| Dashboard com **88 salas** ou estado antigo após corrigir o `treeTowerSeed.json` no Git | O **Neon** guarda o snapshot na tabela `building_state`; não é substituído só por um novo deploy. Depois do deploy com o seed certo, chama **`POST /api/admin/reapply-seed`** com header `Authorization: Bearer <EXCEL_SYNC_SECRET>` (o mesmo do sync Excel). |

---

## Resumo ultra-curto

1. **Neon:** projeto → copiar **connection string pooled** → guardar password.  
2. **Vercel:** importar repo → `DATABASE_URL` + `AUTH_SECRET` + `APP_LOGIN_PASSWORD` → **Deploy**.  
3. Abrir o URL `.vercel.app` e testar login.

---

## Outros documentos

- [DEPLOY-VERCEL-SUPABASE.md](./DEPLOY-VERCEL-SUPABASE.md) — mesmo fluxo na Vercel + notas gerais e alternativas.  
- [DEPLOY.md](./DEPLOY.md) — VPS + Docker.  
- [.env.example](./.env.example) — lista de variáveis.
