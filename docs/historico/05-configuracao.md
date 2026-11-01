# 05 — Configuração, deploy e estrutura do Supabase

Valores reais: [VEJA SEGREDOS.local.md]. Aqui só aparecem nomes.

## Variáveis de ambiente

| Nome | Onde | Para quê |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env` local (não versionado) e *secret* do GitHub Actions | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | `.env` local e *secret* do GitHub Actions | Chave pública (anon) — única chave no app |

Modelo: `.env.example`. Sem essas variáveis o app abre em **modo demonstração** (dados só no aparelho).
**Nunca** usar a chave `service_role` / `sb_secret` no app ou no repositório.

## Rodar localmente

```bash
npm install
cp .env.example .env      # preencher [VEJA SEGREDOS.local.md]
npm test                  # 65 testes (Vitest)
npm run dev               # http://localhost:5173
npm run build && npx cap sync   # atualiza android/ e ios/
npx cap open android      # Android Studio
npx cap open ios          # Xcode (Mac)
```

Marca: `scripts/build_brand.py` (SVGs) e `scripts/render_brand_png.cjs` (PNGs); ícones/splash nativos com
`npx @capacitor/assets generate`.

## Deploy (APK Android)

- Workflow `.github/workflows/android.yml` ("Gerar APK Android (Fynvault)"): roda em todo push na `main` e
  manualmente (Actions → Run workflow).
- Passos: `npm ci` → `npm test` → `npm run build` com os secrets → `npx cap sync android` →
  `./gradlew assembleDebug` → publica `Fynvault.apk` em Releases com a tag `v1.1.<número da execução>`.
- Secrets do repositório (Settings → Secrets and variables → Actions): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Commits que só mudam migrations usam `[skip ci]` no título.
- Assinatura: `android/app/debug.keystore` (chave de debug fixa). Identificador: `br.com.minhasfinancas.app`.

## Banco: aplicar migrations

No Supabase → SQL Editor, colar e executar, **em ordem**, cada arquivo de `supabase/migrations/`.
Todas são idempotentes e só acrescentam. Conferir: `select * from app_migrations order by version;`

| Migration | Conteúdo |
|---|---|
| `0001_inicial.sql` | categories, payment_methods, installment_plans, recurring_bills, transactions; RLS; `touch_updated_at`; RPC `create_installment_plan`; `app_migrations` |
| `0002_perfil_onboarding_metas.sql` | profiles; contas fixas/variáveis (`amount_type`, `income_source`); `receipt_path`; savings_goals, goal_contributions; buckets avatars/receipts |
| `0003_sincronizacao_offline.sql` | `updated_at` + `client_updated_at` em tudo; gatilho `skip_stale_update`; índices de sincronização; `deleted_rows` + gatilho `log_deletion` |
| `0004_modo_familia.sql` | family_members, family_invites; funções `can_access`, `same_family`, `accept_family_invite`; políticas de família |
| `0005_lgpd_excluir_conta.sql` | função `delete_my_account` |
| `0006_reservas.sql` | reservas (`savings_goals` sem alvo), `goal_contributions.kind`, `app_schema_version()` |
| `0007_cartao_credito.sql` | cartão (`type`, `closing_day`, `due_day`, `credit_limit`), `transactions.purchase_date` |
| `0009_caixa_contas.sql` | contas do caixa (`payment_methods.type = 'account'`, `opening_balance`, `opening_date`), `transactions.paid_from`, tabela `account_moves` (transferências e ajustes, RLS de família) |
| `0008_gestor_seguranca.sql` | `app_admins`, `security_events`, `security_alerts`; `log_security_event`, `join_family` (limite de convite), funções `admin_*`; funções antigas fechadas para `anon` |

## Tabelas (schema `public`)

| Tabela | Principais colunas | Observações |
|---|---|---|
| `categories` | id, user_id, parent_id, name, kind (expense/income), nature (essencial/superfluo/investimento), icon, color, monthly_budget, sort_order, archived | subcategorias via parent_id |
| `payment_methods` | id, user_id, name, archived | |
| `installment_plans` | id, user_id, description, creditor, category_id, payment_method_id, total_amount, installments 1–120, first_due, notes | parcelas em transactions |
| `recurring_bills` | id, user_id, description, kind, amount, amount_type (fixed/variable), income_source, day_of_month 1–31, category_id, payment_method_id, start_month, end_month, active, generated_until, notes | |
| `transactions` | id, user_id, kind, amount, date, description, category_id, payment_method_id, paid, paid_at, installment_plan_id, installment_number, recurring_bill_id, recurring_month, receipt_path, notes | único (recurring_bill_id, recurring_month) |
| `profiles` | user_id (pk), display_name 1–40, avatar_emoji, avatar_path, reminder_time, onboarding_completed_at | |
| `savings_goals` | id, user_id, name, icon, color, target_amount, monthly_contribution, contribution_day, target_date, archived | único (id, user_id) |
| `goal_contributions` | id, user_id, goal_id, amount, date, note | FK composta (goal_id, user_id) |
| `deleted_rows` | id, user_id, table_name, row_id, deleted_at | só leitura; preenchida por gatilho |
| `family_members` | owner_id, member_id, role (editor/viewer) | pk (owner_id, member_id), owner ≠ member |
| `family_invites` | code (pk) `^[A-Z2-9]{6}$`, owner_id, role, expires_at (7 dias), used_by, used_at | |
| `app_migrations` | version, applied_at | controle das migrations |
| `account_moves` | kind (transfer/adjust), from_id, to_id, amount > 0, date, note | FKs (id, user_id) para payment_methods; só da 0009 |
| `app_admins` | user_id | gestores; sem políticas (só pelo SQL Editor) |
| `security_events` | kind, email, user_id, ip, user_agent, detail | só pelas funções; apagados após 90 dias |
| `security_alerts` | dedupe (regra+quem+dia), level, title, detail, resolved_at, notified_at | só pelas funções |

Todas as tabelas de dados têm `created_at`, `updated_at`, `client_updated_at` (a partir da 0003).

## Políticas (RLS ativo em todas)

- Tabelas de dados: `family read` (select se `can_access(user_id,'read')`), `family insert` / `family update` /
  `family delete` (se `can_access(user_id,'write')`). `can_access` = é o dono **ou** é membro (leitura) /
  membro editor (escrita).
- `profiles`: `profile read` (próprio ou `same_family`), `profile write` (só o próprio).
- `deleted_rows`: `own deletions` (select via `can_access`).
- `family_members`: leitura pelo dono ou pelo membro; update só do dono; delete pelo dono (remover) ou membro (sair).
- `family_invites`: `own invites` (só o dono). Aceite apenas pela função `join_family(p_code)` (0008, 10 erros por hora;
  `accept_family_invite` antiga passa por ela).
- `app_admins`, `security_events`, `security_alerts`: RLS ligado e nenhuma política — só funções `security definer`.

## Storage (buckets privados)

| Bucket | Limite | Tipos | Caminho |
|---|---|---|---|
| `avatars` | 5 MB | jpeg, png, webp | `<user_id>/<arquivo>` |
| `receipts` | 10 MB | jpeg, png, webp, pdf | `<user_id>/<arquivo>` |

Políticas em `storage.objects`: envio/alteração/exclusão só pelo dono da pasta; leitura de `avatars` pelo dono
ou família (`same_family`), de `receipts` por `can_access(read)` (envio/exclusão de comprovante também pelo editor).
Acesso no app por links temporários (signed URLs).

## Auth

E-mail + senha; recuperação de senha por código (OTP) enviado por e-mail. Provedor de e-mail configurado no painel
do Supabase (Authentication → Providers / Email).

## Segurança (0008)

- Gestor: `insert into public.app_admins (user_id) select id from auth.users where email = '...';` no SQL Editor.
- CSP da versão web gerada no `vite.config.ts` (endereço do Supabase vem de `VITE_SUPABASE_URL`); o APK é montado com
  `VITE_TARGET=android` e não leva CSP.
- `security-check.yml`: todo dia, com o secret `SUPABASE_DB_URL`, marca alertas novos como avisados, apaga registros com
  mais de 90 dias, roda `npm audit` e abre/comenta uma issue `seguranca` (sem dados pessoais).
