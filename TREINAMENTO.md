# Treinamento — Sistema Tree Tower

Dois cursos interativos (um para **corretores**, outro para **gestores/secretários**),
mais um **ambiente de treino** local e seguro para praticar sem afetar o banco de dados real.

---

## 1. Cursos interativos (abrem no navegador)

Pasta **`treinamento/`** — é só **dar duplo-clique**, abre em qualquer navegador (PC ou celular), **sem instalar nada**. O progresso fica salvo no navegador. Podem ser enviados por e-mail/WhatsApp ou colocados numa pasta compartilhada.

- **[`treinamento/index.html`](treinamento/index.html)** — página inicial para escolher o curso.
- **[`treinamento/treinamento-corretores.html`](treinamento/treinamento-corretores.html)** — **Corretores** (modo visualização): navegar pelos andares, ver salas disponíveis, áreas e valores, e o que cada status significa.
- **[`treinamento/treinamento-gestores.html`](treinamento/treinamento-gestores.html)** — **Gestores e Secretários** (operação completa): níveis de acesso, reservar (com o que preencher), vender, escritura, distrato, aviso de reservas, histórico e relatórios.

> Sem quiz — são cursos de leitura/consulta, com passo a passo e checklist de “concluído”.

---

## 2. Ambiente de treino (praticar sem risco)

Uma cópia do sistema que roda **no computador**, com dados **isolados em arquivo** e **sem `DATABASE_URL`** —
ou seja, **nunca toca o banco de dados real da empresa**. Pode reservar, vender, distratar à vontade.

### Como iniciar

No computador que tem o projeto (com **Node.js** instalado):

```bash
npm run treino
```

ou **duplo-clique** em **`Treinamento.bat`**.

Depois abra no navegador: **http://localhost:3200**

> **Primeira vez:** se nunca rodou o projeto nesse computador, abra a pasta no terminal e rode `npm install` uma vez antes.

### Acesso de outras pessoas (outros PCs / celulares)

`localhost` só funciona **no próprio computador** que está rodando o treino. Para a **equipe acessar de outros aparelhos**, há duas opções:

**Opção A — um "computador-servidor" (recomendado):** uma só máquina roda o `Treinamento.bat`, e todos acessam pela rede.

1. **Configuração única (uma vez só):** dê **duplo-clique em `Liberar-acesso-rede.bat`** e clique **Sim** na permissão de administrador. Isso libera a porta no firewall do Windows — **sem isso, outros PCs não conseguem acessar**.
2. Rode o **`Treinamento.bat`**. Ele mostra dois endereços, ex.:
   - `Neste computador:  http://localhost:3200`
   - `Outros aparelhos:  http://192.168.0.15:3200` ← **compartilhe este** (é o IP da Wi-Fi)
3. As outras pessoas, **na mesma rede Wi-Fi**, abrem `http://192.168.0.15:3200` (o IP que apareceu) no navegador do PC ou celular.
4. Mantenha o computador-servidor ligado e o `Treinamento.bat` aberto durante o uso.

> **O IP certo:** em caso de dúvida, no servidor rode `ipconfig` e use o **"Endereço IPv4" do adaptador Wi-Fi** (ex.: `192.168.x.x`) — **não** use IP de VPN (Radmin `26.x`, Hamachi, etc.).
>
> **Ainda não acessa?** Verifique: (1) os aparelhos estão na **mesma** rede (não na "Visitante"/guest); (2) o roteador não está com "isolamento de clientes" ligado; (3) o `Liberar-acesso-rede.bat` foi mesmo executado como administrador.

**Opção B — cada um no seu PC:** instalar o projeto + Node.js em cada computador e rodar o `Treinamento.bat` localmente (usa `localhost:3200`). Mais trabalhoso.

> Dica: o endereço de rede também funciona no **celular** — ótimo para treinar a versão mobile.

### Usuários de treino (senha `treino123`)

| Perfil          | Login        | Senha       |
|-----------------|--------------|-------------|
| Secretária      | `secretaria` | `treino123` |
| Gestor          | `gestor`     | `treino123` |
| Gestora-admin   | `juliany`    | `treino123` |

> São usuários **fictícios**, válidos **só** no modo treino.

### Zerar os dados de treino

```bash
npm run treino:reset
```

Apaga a pasta `.data-treino/` e recomeça do estado inicial.

---

## 3. Roteiro de prática sugerido

1. **Secretária** (`secretaria`): em **Salas**, reserve uma sala em ESTOQUE — preencha **comprador, corretor e imobiliária**. Tente salvar sem um deles e veja o aviso.
2. **Gestor** (`gestor`): veja a reserva na caixa **Reservas**; abra a sala e **efetive a venda** (status VENDIDO, valor e data).
3. Ainda como **gestor**, tente alterar um campo da sala vendida → veja a **trava** agir.
4. Marque a **Escritura = Sim** e confira o subitem **"Escrituradas"** no **Resumo** do Dashboard.
5. **Juliany** (`juliany`): faça um **distrato** da venda → a sala volta para **ESTOQUE** e os dados são limpos.

---

## Por que é seguro

- O modo treino **não define `DATABASE_URL`** → o sistema grava num **arquivo local** (`.data-treino/`), não no Neon.
- Mesmo que exista um `.env.local` com `DATABASE_URL`, o launcher o **ignora** (força o modo arquivo) e avisa.
- Os usuários e senhas de treino são **separados** dos de produção.
