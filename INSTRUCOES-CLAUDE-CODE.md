# Texto para dar ao Claude Code

Instale o Claude Code no seu computador, abra o terminal na pasta onde descompactou
este projeto, escreva `claude` e cole o texto dentro da caixa abaixo.

Ele tem acesso ao seu terminal, por isso consegue fazer o `git push` e correr o
Supabase CLI com as suas credenciais — coisas que eu, a partir da conversa, não consigo.

---

```
Tenho nesta pasta um site de marcações estático (HTML/CSS/JS, sem build) que usa
Supabase. Conta GitHub: menelaussp-pixel. Ajuda-me a pôr isto no ar.

Primeiro lê o README.md desta pasta: tem a arquitetura toda e os 5 passos de
instalação. Não reescrevas a aplicação — ela está feita e testada. O que preciso é
de publicação e configuração.

Faz, por esta ordem, e pergunta-me sempre que precisares de algo que só eu sei:

1. Inicializa o repositório git e cria um repositório PRIVADO no GitHub chamado
   "estetica-anabela" na conta menelaussp-pixel, usando o gh CLI. Se o gh não
   estiver autenticado, diz-me os comandos para eu fazer o login.

2. Confirma que o .gitignore existe e que assets/config.js NÃO fica com credenciais
   reais no commit inicial (deixa os valores de exemplo).

3. Faz o primeiro commit e push para main.

4. Ativa o GitHub Pages a partir de main / root, e diz-me o URL final.

5. Explica-me, passo a passo e com cliques concretos, o que tenho de fazer no
   dashboard do Supabase:
   - criar o projeto na região mais próxima de Portugal
   - correr supabase/01_schema.sql e depois supabase/02_dados.sql no SQL Editor
   - criar a conta de utilizador da dona com Auto Confirm ligado
   - DESLIGAR os registos públicos (Authentication > Providers > Email >
     Enable sign ups), para que mais ninguém consiga criar conta
   - onde encontrar a Project URL e a chave anon

6. Quando eu te der a URL e a chave anon, mete-as em assets/config.js, faz commit
   e push.

7. Depois de publicado, testa o fluxo todo comigo: abrir o site, escolher dois
   serviços, confirmar que o total e a duração somam, marcar uma hora, e ver se a
   marcação aparece no painel.html em tempo real sem eu recarregar a página.

Duas coisas que tens de me lembrar no fim:

- Há dois serviços com preços inventados que eu tenho de corrigir no painel:
  Senhores > Meia-Perna e Senhores > Virilhas. Estão marcados com "<<< CONFIRMAR"
  no ficheiro supabase/02_dados.sql.
- O site e o painel estão em português de Portugal. Se gerares algum texto novo
  para a interface, tem de ser em pt-PT, não pt-BR.
```

---

## Se não quiser usar o Claude Code

Dá perfeitamente para fazer à mão. Siga o `README.md` — são os mesmos 5 passos.
A parte do GitHub resume-se a:

```bash
cd estetica-anabela
git init -b main
git add .
git commit -m "Primeira versão do site de marcações"
gh repo create menelaussp-pixel/estetica-anabela --private --source=. --push
```

E depois ativar o Pages em **Settings → Pages → Deploy from a branch → main / (root)**.
