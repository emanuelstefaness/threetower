# Deploy: Vercel (grátis) + PostgreSQL gerido

Este guia é para quem quer **sem VPS**: front + API no **Next.js na Vercel** e base **PostgreSQL** noutro serviço (só precisas de uma **`DATABASE_URL`**). O código já usa Postgres e a tabela `building_state`.

**Passo a passo completo só com Neon:** [DEPLOY-VERCEL-NEON.md](./DEPLOY-VERCEL-NEON.md)

---

## Alternativas ao Supabase (se já tens outros projetos lá)

Tudo o que segue expõe **Postgres** com connection string — colas o mesmo **`DATABASE_URL`** nas variáveis da Vercel.

| Serviço | Nota |
|---------|------|
| **[Neon](https://neon.tech)** | Muito usado com **Vercel** e serverless; tier grátis, **pooling** incluído; costuma ser a alternativa mais simples ao Supabase. |
| **[Render](https://render.com)** | Podes criar **PostgreSQL** gerido; há tier grátis com limitações (ex.: instância pode “dormir”). |
| **[Railway](https://railway.app)** | Postgres como serviço; **créditos** mensais no plano gratuito (regras mudam). |
| **[ElephantSQL](https://www.elephantsql.com)** | Plano **Tiny** grátis (base **pequena** — chega para testes leves). |
| **[CockroachDB serverless](https://www.cockroachlabs.com/cloud/)** | Compatível com driver **pg** em modo Postgres; verifica limites do free tier. |

**Neon (recomendado para este caso):** ao criar o projeto, copia a **connection string** (há modo **pooled** para serverless). Na Vercel, só defines `DATABASE_URL` como noutro guia — **não** precisas de alterar código.

---

## 1. Supabase — criar projeto e obter a URL

1. Entra em [https://supabase.com](https://supabase.com) e cria conta (GitHub/Google).
2. **New project** → escolhe região (ex.: **South America** se existir) e palavra-passe da base.
3. Quando estiver **Active**, vai a **Project Settings** → **Database**.
4. Em **Connection string**, escolhe **URI** e modo adequado a **serverless**:
   - Usa **Connection pooling** (Supavisor / pooler, porta **6543**, modo **Transaction**) se a consola oferecer — reduz ligações esgotadas com muitas funções a frio na Vercel.
   - Copia a string e substitui `[YOUR-PASSWORD]` pela password da base.
5. A URL deve incluir SSL (ex.: `?sslmode=require` ou parâmetros do Supabase). Não partilhes esta string publicamente.

---

## 2. Vercel — ligar o repositório (igual para Supabase, Neon, etc.)

1. Entra em [https://vercel.com](https://vercel.com) e faz login.
2. **Add New** → **Project** → importa o repo **GitHub** `emanuelstefaness/threetower` (ou o teu fork).
3. **Framework Preset:** Next.js (detetado automaticamente).
4. **Build:** `npm run build` / **Output:** predefinição (não uses “standalone” na Vercel; o `next.config` pode manter `standalone` para Docker local — a Vercel ignora para o deploy dela).
5. **Environment Variables** (Production + Preview se quiseres testar PRs):

| Nome | Valor |
|------|--------|
| `DATABASE_URL` | Cola a connection string (**Supabase**, **Neon**, ou outro — secção de cima). |
| `AUTH_SECRET` | Cadeia longa e aleatória (login em produção). |
| `APP_LOGIN_PASSWORD` | Palavra-passe dos editores no formulário. |

Opcional:

| Nome | Valor |
|------|--------|
| `APP_MODE` | `view` se quiseres só leitura neste deploy. |

6. **Deploy**.

---

## 3. Depois do primeiro deploy

- Abre o URL que a Vercel mostra (ex.: `threetower-xxx.vercel.app`).
- Deves ver o **login** se `AUTH_SECRET` estiver definido.
- A primeira carga grava o estado na base **automaticamente** (a app cria a tabela se precisar).

---

## 4. Limitações a ter em conta (uso pouco concorrente)

- **Tempo real (SSE)** `/api/events`: na Vercel há **limite de duração** por função (no plano gratuito pode ser **curto**). O projeto define `maxDuration` e `vercel.json`; se o “tempo real” cortar, em uso leve pode nem notar-se. Se notares desconexões frequentes, considera plano **Pro** ou aceita que o dashboard atualize ao recarregar.
- **Várias instâncias serverless**: com **poucos utilizadores** ao mesmo tempo, o estado em memória + Postgres costuma comportar-se bem; evita picos de muitas escritas em paralelo.
- **Créditos / limites**: Vercel e Supabase têm quotas no free tier — consulta os sites oficiais.

---

## 5. Domínio próprio (opcional)

Na Vercel: **Project** → **Settings** → **Domains** → adiciona o teu domínio e segue as instruções de DNS.

---

## 6. Variáveis só no painel

**Nunca** commits `DATABASE_URL`, `AUTH_SECRET` ou passwords — usa só **Environment Variables** na Vercel.

---

## Referência

- Deploy genérico e Docker: [DEPLOY.md](./DEPLOY.md)
- Variáveis de exemplo: [.env.example](./.env.example)
