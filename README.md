# Estética Anabela — marcações online

Site de marcações para o salão, com duas partes:

| Ficheiro | Para quem | O que faz |
|---|---|---|
| `index.html` | clientes | Tabela de preços Senhoras e Senhores, escolha de vários serviços, calendário, horas livres e marcação |
| `painel.html` | a dona | Login, marcações em tempo real, clientes, edição e reordenação dos serviços, horário, férias |

Não tem servidor próprio nem passo de compilação: são ficheiros estáticos que falam diretamente com o Supabase.
Custo total: **0 €** (Supabase free tier + GitHub Pages).

---

## Instalação em 5 passos

### 1. Criar o projeto no Supabase

1. Entre em <https://supabase.com/dashboard> → **New project**
2. Nome: `estetica-anabela`, região **West EU (London)** ou **Frankfurt** (mais perto de Portugal)
3. Guarde a palavra-passe da base de dados num sítio seguro

### 2. Criar as tabelas

No Supabase: **SQL Editor** → **New query** → cole e execute, por esta ordem:

1. o conteúdo de `supabase/01_schema.sql`
2. o conteúdo de `supabase/02_dados.sql`

Os dois podem ser executados mais do que uma vez sem estragar nada.

### 3. Criar a conta da dona

**Authentication** → **Users** → **Add user** → **Create new user**

- Email: `<utilizador>@painel.estetica-anabela.invalid` (o painel só pede o `<utilizador>`; este domínio é reservado e não recebe correio)
- Password: uma palavra-passe à escolha
- Ligue **Auto Confirm User** (senão a conta fica à espera de confirmação por email)

Em **Authentication → Providers → Email**, desligue **Enable sign ups**.
Assim mais ninguém se consegue registar sozinho — só esta conta entra no painel.
### 4. Ligar o site ao Supabase

Em **Project Settings → API** copie:

- **Project URL**
- a chave **anon public**

Abra `assets/config.js` e substitua os dois valores.

> A chave `anon` é pública por natureza e pode ficar no código à vista.
> Quem protege os dados são as políticas RLS da base de dados.
> **Nunca** ponha aqui a chave `service_role`.

### 5. Publicar

No GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**

Fica em `https://<utilizador>.github.io/<repositório>/`

- Link a dar aos clientes: `…/index.html` (ou só a raiz)
- Link do painel: `…/painel.html`

---

## A corrigir antes de abrir ao público

Dois serviços não existiam na plataforma antiga e não tinham preço indicado.
Ficaram com valores **inventados** — estão assinalados com `<<< CONFIRMAR` no `02_dados.sql`:

| Serviço | Valor provisório |
|---|---|
| Senhores · Meia-Perna | 15,00 € · 45 min |
| Senhores · Virilhas | 5,00 € · 20 min |

Corrija no painel: **Serviços → Senhores → ✎**

---

## Como funciona por dentro

**Marcar.** O cliente escolhe os serviços; o site soma as durações e pergunta à base de
dados que horas é que cabem nessa duração, já descontando marcações existentes, férias e
o horário do dia. Ao confirmar, a função `criar_marcacao()` **recalcula o preço e a duração
no servidor** e volta a verificar se a hora continua livre — o que vem do telemóvel do
cliente nunca é aceite como verdade.

**Privacidade.** Quem visita o site não consegue ler a tabela de clientes nem a de
marcações, mesmo mexendo na consola do browser: essas tabelas não têm política de leitura
pública. Só vê serviços, horários e os avisos.

**Tempo real.** O painel subscreve a tabela `marcacoes` por websocket. Uma marcação nova
aparece sozinha, sem recarregar e sem polling.

**Notificações.** Em **Perfil → Notificações neste dispositivo**, a dona ativa os avisos no
telemóvel. Usam a norma Web Push, sem bibliotecas nem contas externas: quando entra uma
marcação, a base de dados chama a função `notificar-marcacao`, que encripta o aviso e o
entrega através do serviço de push do próprio navegador, mesmo com o painel fechado.

**WhatsApp.** Os botões abrem o WhatsApp com a mensagem já escrita, através dos links
oficiais `wa.me`. É preciso tocar em enviar — é de propósito. Envio automático obriga à
WhatsApp Business API da Meta, que é paga por mensagem, e as bibliotecas que prometem
envio automático grátis são não-oficiais e dão banimento do número.

---

## O que a dona pode mudar sozinha, sem tocar em código

- Preços, durações, nomes dos serviços
- A **ordem** em que os serviços aparecem (arrastar, ou setas ▲▼)
- Ativar/desativar um serviço sem o apagar
- Os textos de aviso no topo de cada tabela de preços
- Horário de cada dia da semana
- Fechar períodos (férias, folgas)
- Intervalo entre horas e antecedência mínima de marcação
- O utilizador e a palavra-passe de acesso ao painel (**Perfil → Acesso ao painel**)

---

## Notas

- **O projeto Supabase gratuito adormece ao fim de 7 dias sem atividade.** Nada se perde;
  basta ir ao dashboard e carregar em *Restore*. Com marcações diárias nunca acontece.
- Limites do plano gratuito: 500 MB de base de dados, 200 ligações em tempo real,
  2 milhões de mensagens/mês. Para um salão, sobra muito.
- Para um domínio próprio (ex.: `esteticaanabela.pt`), GitHub Pages aceita domínios
  personalizados de graça — só o domínio é que se paga, à volta de 10–15 €/ano.

## Estrutura

```
index.html              site dos clientes
painel.html             painel da dona
manifest.json           para instalar no telemóvel
sw.js                   mostra as notificações
assets/
  config.js             <<< os dados do Supabase vão aqui
  estilo.css
  comum.js              funções partilhadas
  cliente.js
  painel.js
  agenda.js             calendário do painel (dia, semana, mês)
  push.js               ativar as notificações no dispositivo
supabase/
  01_schema.sql         tabelas, segurança (RLS) e funções
  02_dados.sql          serviços, horários e avisos iniciais
  03_push.sql           tabela e gatilho das notificações
  functions/notificar-marcacao/   envia as notificações
```
