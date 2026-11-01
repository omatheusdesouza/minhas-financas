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

## Cartão de crédito (31/10/2026)

- **A compra no cartão conta no mês da fatura** (escolha do usuário): o lançamento guarda o vencimento da fatura em `date`
  e o dia da compra em `purchase_date`. Assim todas as telas, relatórios e o saldo do mês já seguem a fatura sem regra extra.
- **Fatura não é tabela:** é o grupo das compras do cartão com o mesmo vencimento; pagar = marcar essas compras como pagas.
- **Compra no dia do fechamento vai para a fatura seguinte.**
- Fica para depois: pagamento parcial (rotativo), estorno e assinatura mensal no cartão (conta fixa paga no cartão).

## Importar extrato (31/10/2026)

- **OFX e CSV, sem migration:** o id de cada lançamento importado é calculado do FITID do banco (ou de data+valor+descrição),
  então importar o mesmo arquivo de novo não duplica.
- **Conta em aberto com o mesmo valor (até 5 dias) recebe baixa** em vez de virar lançamento novo.
- **Pagamento de fatura, aplicações e caixinhas vêm desmarcados** (as compras do cartão e as reservas já contam).
- **Categoria sugerida:** primeiro pelo que o usuário já usou para a mesma descrição, depois por palavras comuns (iFood, posto…).

## Segurança e gestor (31/10/2026)

- **Não bloquear F12/botão direito:** não impede ninguém de ver o código e atrapalha acessibilidade. Esconder código não é
  proteção; RLS, CSP e funções no banco são.
- **Gestor dentro do app, não app separado:** mesmo login e mesmo deploy; quem decide é a tabela `app_admins` no banco.
- **Painel sem dados financeiros (LGPD):** só conta e segurança. Ver finanças alheias sem motivo violaria a finalidade.
- **Senha errada é registrada pelo app** (o Supabase não expõe as falhas de login ao banco); tentativas direto na API
  aparecem em Supabase › Logs › Auth. Por isso o registro aceita chamada sem login, com limite por IP e trava geral.
- **Sem travar login por e-mail:** um atacante poderia trancar a conta de outra pessoa errando a senha de propósito.
- **`join_family` devolve o erro em JSON** em vez de exceção: exceção desfaria o registro da tentativa e o limite não valeria.
- **CSP só na web:** o APK não leva a política (evita risco com a ponte nativa do Capacitor).
- **Issue sem dados pessoais:** o repositório é público; os detalhes ficam só no painel.
- **Excluir conta pelo gestor não apaga fotos/comprovantes:** o Supabase não deixa apagar arquivos por SQL; o painel avisa a pasta.

## Capacitor 8 (01/11/2026)

- **Migração 6 → 7 → 8 com `cap migrate`** (a ferramenta só sobe uma versão por vez); wrapper do Gradle ajustado à mão (8.14.3).
- **Mínimo Android 7 (API 24)**, exigência do Capacitor 8. Celulares com Android 5/6 deixam de receber atualizações.
- **Tela de ponta a ponta no Android 15+:** cor e sobreposição da barra de status deixaram de ser configuráveis; o app já
  usa `viewport-fit=cover` e `env(safe-area-inset-*)`, que o Capacitor 8 preenche (`SystemBars`, padrão `css`).
- **PIN salvo continua valendo:** o armazenamento seguro 8 usa o mesmo formato e prefixo do 6.
- **Avisos moderados restantes** (glob/minimatch no CLI, workbox, archiver do exceljs) são de ferramentas de montagem ou
  de leitura de arquivos em disco; não rodam no app. Ficam para quando as bibliotecas lançarem correção.

## Importar PDF e movimento (01/11/2026)

- **Seletor de arquivo sem `accept`:** Android e iPhone não conhecem o tipo .ofx e deixavam o arquivo cinza. O formato é
  reconhecido pelos primeiros bytes (%PDF, PK = xlsx) ou pelo texto (OFX/CSV).
- **PDF por texto, não por imagem:** pdf.js (versão legacy, para iPhones mais antigos) extrai o texto e as linhas são
  remontadas pela altura. PDF escaneado (foto) não é lido; o app explica e sugere OFX/CSV. A senha do PDF não é guardada.
- **Na prévia, tocar no valor troca gasto/ganho:** o sinal em PDF é heurístico; o usuário corrige antes de importar.
- **Animações só na entrada (fill-mode backwards):** transform permanente na tela quebraria painéis com posição fixa.
  Quem ativou "reduzir movimento" no aparelho não vê animações.
- **Lista mostra só a subcategoria;** o caminho completo fica no título (ao passar o mouse).

