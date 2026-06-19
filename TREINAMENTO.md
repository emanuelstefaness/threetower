# Treinamento — Sistema Tree Tower

Material de treinamento para **gestores** e **secretários(as)** aprenderem a operar o sistema,
mais um **ambiente de treino** local e seguro para praticar sem afetar o banco de dados real.

---

## 1. Curso interativo (abre no navegador)

Arquivo: **[`treinamento/treinamento-tree-tower.html`](treinamento/treinamento-tree-tower.html)**

- É só **dar duplo-clique** no arquivo — abre em qualquer navegador, **sem instalar nada**.
- Tem 11 módulos (visão geral, papéis, fluxos de reserva/venda/escritura/distrato, regras) e um **quiz** no final.
- O progresso fica salvo no navegador.
- Pode ser enviado por e-mail/WhatsApp ou colocado numa pasta compartilhada para a equipe.

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
