# 02 — Decisões técnicas e de produto

Cada item: **decisão** — motivo.

## Plataforma e stack

- **React + TypeScript + Vite + Capacitor 6** — um só código gera app instalável para Android e iOS (o usuário
  pediu os dois e "não quero que seja na web"); sem precisar de Mac para o Android.
- **Supabase (Postgres + Auth + Storage)** — conta própria com e-mail/senha e dados na nuvem com plano gratuito;
  segurança por Row Level Security no próprio banco.
- **HashRouter** — rotas funcionam dentro do WebView do Capacitor sem servidor.
- **Recharts** para gráficos; **jsPDF + jspdf-autotable** e **ExcelJS** para exportação (carregados sob demanda
  para não pesar a abertura do app).
- **Modo demonstração** sem variáveis do Supabase — permite testar o app sem nuvem.

## Build e distribuição

- **APK gerado no GitHub Actions** — o ambiente de desenvolvimento não acessa `dl.google.com`/Maven do Google.
- **Testes rodam antes do build** — um APK só sai se recorrência e lembretes estiverem corretos.
- **Keystore de debug fixa versionada** (`android/app/debug.keystore`, senha padrão pública do Android) —
  APKs sucessivos com a mesma assinatura atualizam por cima sem perder dados. Para Play Store, criar chave de release
  própria (não versionar).
- **versionCode = número da execução do Actions; release `v1.1.N`** — cada build é instalável por cima do anterior.
- **Commits só de migration levam `[skip ci]`** — não gerar APK sem mudança de app.

## Nome e identidade

- **Nome exibido "Fynvault", identificador `br.com.minhasfinancas.app` mantido** — app já instalado; trocar o id
  faz o celular tratá-lo como outro app e impede atualizar.
- **Repositório não renomeado** — regra do usuário: só com confirmação (não houve).
- **Banco não renomeado** — regra: tabelas/colunas só via migration preservando dados; não havia necessidade.
- **Fundo claro off-white, Cormorant (serifa) no logotipo e números de destaque, Inter na interface** — pedido de
  "o mais sofisticado possível"; Cormorant escolhida pelo usuário.
- **Monograma F redesenhado, sem seta de crescimento** — pedido do usuário ("quem usa o app já sabe para que serve").
- **Logo convertida em contornos (fonttools)** — o SVG não depende da fonte instalada.
- **Números "lining" no teclado do PIN** — algarismos old-style da Cormorant ficavam desalinhados.
- **Modo escuro com a mesma paleta** — exigência da fase 2; tema claro/escuro/automático em Ajustes.

## Banco de dados

- **Migrations numeradas, idempotentes, só aditivas, registradas em `app_migrations`** — regra do usuário (nunca
  apagar dados) e permite reexecutar sem erro.
- **Plano mostrado e aprovado antes de cada migration** (0002, 0003; a 0004 veio após "continuar sem aprovação").
- **Índice único (recurring_bill_id, recurring_month)** — impede a mesma conta do mês duas vezes; índice completo
  (não parcial) para funcionar com upsert.
- **`generated_until` nas contas recorrentes** — um mês apagado pelo usuário não é recriado.
- **`skipPastDue` ao criar contas no onboarding** — não nascer conta já vencida.
- **Valor nulo permitido só em conta variável não paga** (checks no banco) — "Informar valor" depois.
- **Buckets privados `avatars` e `receipts`, pasta `<user_id>/`, links temporários** — fotos e comprovantes só do dono.
- **Tabela `deleted_rows` + gatilho** — outros aparelhos ficam sabendo de exclusões.
- **`client_updated_at` + gatilho `skip_stale_update`** — última edição feita vence, mesmo chegando fora de ordem.
- **Checagem do schema no app** — sem a 0003 o app mostra aviso e não sincroniza (evita gravar errado).

## Recorrência e lembretes

- **Conta do mês seguinte gerada automaticamente; dia 29–31 vira o último dia em meses curtos.**
- **Valor variável não é propagado** — cada mês pede "Informar valor".
- **Notificações locais (não push)** — funcionam com o app fechado e sem servidor; reagendadas após reiniciar.
- **Agenda recalculada inteira a cada mudança** — cancelar/reagendar fica sempre correto ao editar/pagar/excluir.
- **Máximo 60 lembretes nos próximos 30 dias** — limite de 64 notificações do iOS.
- **Dois canais Android (`fv-lembretes`, `fv-alertas`)** — o crítico com prioridade alta e cor vermelha.
- **Lembretes só das próprias contas** (escopo `own`) — no modo família não notificar contas de outra pessoa.

## Segurança

- **Só a chave anon no cliente; nenhuma service role; `.env` no .gitignore** — exigência da fase 4.
- **RLS em todas as tabelas** — cada usuário só vê os próprios dados; família só o compartilhado.
- **PIN guardado como hash PBKDF2-SHA256 (150 mil iterações) + sal, no Keystore/Keychain; espera após 5 erros.**
- **Bloqueio não vai para a nuvem** — é do aparelho; sair da conta ou "Esqueci o PIN" remove.
- **Tempo de bloqueio conta do primeiro "sair do app"** — eventos duplicados do Android bloqueavam na hora.

## Offline e sincronização

- **Telas sempre leem/gravam a cópia local (IndexedDB)** — app rápido e funcional sem internet.
- **Ids criados no aparelho** — reenviar não duplica; contas do mês com id determinístico (`recurring:<conta>|<mês>`)
  para dois aparelhos gerarem o mesmo id.
- **Fila enviada em ordem, operações seguidas na mesma linha agrupadas, usando a última** — corrigiu perda de
  pagamento feito offline.
- **Busca com sobreposição de 5 minutos** — tolera diferença de relógio entre aparelho e servidor.
- **"Sincronizar agora" durante uma sincronização agenda outra em seguida** — resultado nunca desatualizado.
- **Primeira sincronização exige internet** — para não mostrar um app vazio como se não houvesse dados.
- **Banco local apagado ao sair da conta** — privacidade em aparelho compartilhado.

## Modo família

- **Convite por código de 6 caracteres sem O/I/0/1, válido 7 dias, uso único** — fácil de ditar, sem confusão.
- **Papéis "Só visualizar" (viewer) e "Pode editar" (editor)** — permissões diferentes pedidas na 3.6.
- **Aceite via função `accept_family_invite` (security definer)** — quem convida não precisa saber o id do outro.
- **Espaços separados no app (seletor)** — o gasto pessoal de um não aparece para o outro.
- **Remoção apaga os dados compartilhados do aparelho de quem saiu.**

## Processo

- **Commits pequenos com mensagens claras em português; push a cada fase.**
- **Testes ponta a ponta contra Postgres real com as migrations** — o binário PostgREST não pôde ser baixado,
  então foi escrito um servidor que imita a API do Supabase.
