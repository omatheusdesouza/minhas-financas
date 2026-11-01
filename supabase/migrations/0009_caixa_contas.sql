-- Fynvault — migration 0009: caixa (contas com saldo), transferências e ajustes
--
-- Cole este arquivo inteiro no "SQL Editor" do Supabase e clique em "Run".
-- Só ACRESCENTA: um tipo novo de forma de pagamento, colunas opcionais e uma tabela. Nenhum dado existente é
-- apagado ou alterado. Pode ser executado mais de uma vez. Requer as migrations 0001 a 0008.
--
-- Como funciona:
--  - Uma CONTA é uma forma de pagamento com type = 'account' (Nubank, Itaú, Carteira...), com o saldo exato
--    informado pela pessoa (opening_balance) e a data desse saldo (opening_date).
--  - Saldo da conta = saldo inicial + ganhos recebidos nela − gastos pagos por ela (só lançamentos pagos, a partir
--    da data do saldo inicial). O caixa é a soma das contas.
--  - transactions.paid_from = de qual conta saiu (ou em qual entrou) o dinheiro quando a forma de pagamento não é
--    uma conta: fatura do cartão paga pelo Itaú, boleto pago pelo Nubank...
--  - account_moves = transferências entre contas (não são gasto nem ganho) e ajustes de saldo (diferença entre o
--    saldo do app e o do banco).

-- ---------------------------------------------------------------------------
-- 1. Contas (formas de pagamento com saldo)
-- ---------------------------------------------------------------------------
alter table public.payment_methods add column if not exists opening_balance numeric(14,2);
alter table public.payment_methods add column if not exists opening_date date;

alter table public.payment_methods drop constraint if exists payment_methods_type_check;
alter table public.payment_methods add constraint payment_methods_type_check
  check (type in ('other', 'credit_card', 'account'));
alter table public.payment_methods drop constraint if exists payment_methods_account_check;
alter table public.payment_methods add constraint payment_methods_account_check
  check (type <> 'account' or (opening_balance is not null and opening_date is not null));

-- as transferências só podem apontar para contas do mesmo dono
create unique index if not exists payment_methods_id_user_key on public.payment_methods (id, user_id);

-- ---------------------------------------------------------------------------
-- 2. De qual conta saiu o dinheiro (quando a forma de pagamento não é uma conta)
-- ---------------------------------------------------------------------------
alter table public.transactions add column if not exists paid_from uuid references public.payment_methods(id) on delete set null;
create index if not exists transactions_paid_from_idx on public.transactions (paid_from) where paid_from is not null;

-- ---------------------------------------------------------------------------
-- 3. Transferências e ajustes de saldo
-- ---------------------------------------------------------------------------
create table if not exists public.account_moves (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('transfer', 'adjust')),
  -- transferência: sai de from_id e entra em to_id; ajuste: só um dos dois (entrada ou saída)
  from_id     uuid,
  to_id       uuid,
  amount      numeric(14,2) not null check (amount > 0),
  date        date not null default current_date,
  note        text check (note is null or length(note) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  client_updated_at timestamptz default now(),
  check (from_id is distinct from to_id),
  check (
    (kind = 'transfer' and from_id is not null and to_id is not null)
    or (kind = 'adjust' and (from_id is null) <> (to_id is null))
  ),
  foreign key (from_id, user_id) references public.payment_methods(id, user_id) on delete cascade,
  foreign key (to_id, user_id) references public.payment_methods(id, user_id) on delete cascade
);
create index if not exists account_moves_sync_idx on public.account_moves (user_id, updated_at);
create index if not exists account_moves_from_idx on public.account_moves (from_id);
create index if not exists account_moves_to_idx on public.account_moves (to_id);

-- sincronização (mesmas regras das outras tabelas: horário da alteração, vale a mais recente, exclusões registradas)
drop trigger if exists account_moves_touch on public.account_moves;
create trigger account_moves_touch before update on public.account_moves
  for each row execute function public.touch_updated_at();
drop trigger if exists account_moves_00_stale on public.account_moves;
create trigger account_moves_00_stale before update on public.account_moves
  for each row execute function public.skip_stale_update();
drop trigger if exists account_moves_log_delete on public.account_moves;
create trigger account_moves_log_delete after delete on public.account_moves
  for each row execute function public.log_deletion();

-- segurança: dono e família (editor para alterar), como as demais tabelas de dados
alter table public.account_moves enable row level security;
drop policy if exists "family read" on public.account_moves;
drop policy if exists "family insert" on public.account_moves;
drop policy if exists "family update" on public.account_moves;
drop policy if exists "family delete" on public.account_moves;
create policy "family read" on public.account_moves for select to authenticated
  using (public.can_access(user_id, 'read'));
create policy "family insert" on public.account_moves for insert to authenticated
  with check (public.can_access(user_id, 'write'));
create policy "family update" on public.account_moves for update to authenticated
  using (public.can_access(user_id, 'write')) with check (public.can_access(user_id, 'write'));
create policy "family delete" on public.account_moves for delete to authenticated
  using (public.can_access(user_id, 'write'));

insert into public.app_migrations(version) values ('0009') on conflict do nothing;
