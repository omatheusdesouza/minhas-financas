# Fynvault — instruções para o Claude

App de finanças pessoais (React + TypeScript + Vite + Capacitor 6, Supabase). Leia o README para a visão geral.

## Histórico do projeto

O histórico completo das conversas de desenvolvimento está em [`docs/historico/`](docs/historico/):

- `01-resumo-geral.md` — o que foi feito, em ordem cronológica
- `02-decisoes.md` — decisões técnicas e de produto, com o motivo
- `03-prompts-importantes.md` — pedidos do dono do projeto, na íntegra
- `04-estado-atual.md` — pronto, parcial, faltando e próximos passos
- `05-configuracao.md` — como rodar, deploy, estrutura do Supabase e nomes das variáveis

`docs/historico/SEGREDOS.local.md` existe só na máquina do dono e é ignorado pelo Git. Nunca o versione,
nunca copie valores dele para outros arquivos e nunca o remova do `.gitignore`.

## Regras do projeto

- Trabalhar em fases, mostrar o plano antes e fazer commits pequenos com mensagens claras em português.
- Não alterar o identificador `br.com.minhasfinancas.app` (impede atualizar o app instalado).
- Não renomear o repositório do GitHub sem confirmação.
- Mudança de banco só por migration numerada em `supabase/migrations/`, idempotente e sem apagar dados;
  mostrar o plano e esperar confirmação antes.
- RLS em todas as tabelas; buckets privados; só a chave anon no cliente; nada de `.env` ou service role no Git.
- Validação em todos os formulários; manter os testes (`npm test`) passando; atualizar o README.
- Commits que só mudam migrations levam `[skip ci]`.
