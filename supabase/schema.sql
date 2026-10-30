-- Minhas Finanças — esquema do banco (Supabase / PostgreSQL)
-- Cole este arquivo inteiro no "SQL Editor" do Supabase e clique em "Run".
-- Cada usuário só enxerga e altera os próprios dados (Row Level Security).

create extension if not exists pgcrypto;

-- Categorias e subcategorias (ex.: Carro > Combustível)
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_id   uuid references public.categories(id) on delete cascade,
  name        text not null check (length(name) between 1 and 60),
  kind        text not null check (kind in ('expense', 'income')),
  -- essencial | superfluo | investimento (usado no índice de saúde financeira)
  nature      text not null default 'essencial' check (nature in ('essencial', 'superfluo', 'investimento')),
  icon        text not null default '🏷️',
  color       text not null default '#64748b',
  monthly_budget numeric(14,2) check (monthly_budget is null or monthly_budget >= 0),
  sort_order  int not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists categories_user_idx on public.categories(user_id);

-- Formas de pagamento (Pix, dinheiro, cartão X, promissória...)
create table if not exists public.payment_methods (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (length(name) between 1 and 40),
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists payment_methods_user_idx on public.payment_methods(user_id);

-- Compras parceladas / promissórias
create table if not exists public.installment_plans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  description   text not null,
  creditor      text,
  category_id   uuid references public.categories(id) on delete set null,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  total_amount  numeric(14,2) not null check (total_amount > 0),
  installments  int not null check (installments between 1 and 120),
  first_due     date not null,
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists installment_plans_user_idx on public.installment_plans(user_id);

-- Contas fixas mensais (aluguel, luz, água, internet, salário...)
create table if not exists public.recurring_bills (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  description   text not null,
  kind          text not null default 'expense' check (kind in ('expense', 'income')),
  amount        numeric(14,2) not null check (amount > 0),
  day_of_month  int not null check (day_of_month between 1 and 31),
  category_id   uuid references public.categories(id) on delete set null,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  start_month   date not null default date_trunc('month', now())::date,
  end_month     date,
  active        boolean not null default true,
  generated_until date,                      -- último mês já lançado automaticamente
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists recurring_bills_user_idx on public.recurring_bills(user_id);

-- Lançamentos: todo gasto ou ganho, pago ou a pagar
create table if not exists public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('expense', 'income')),
  amount        numeric(14,2) not null check (amount > 0),
  date          date not null,               -- data da compra / vencimento
  description   text not null default '',
  category_id   uuid references public.categories(id) on delete set null,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  paid          boolean not null default true,
  paid_at       date,
  notes         text,
  installment_plan_id uuid references public.installment_plans(id) on delete cascade,
  installment_number  int,
  recurring_bill_id   uuid references public.recurring_bills(id) on delete set null,
  recurring_month     date,                  -- 1º dia do mês gerado pela conta fixa
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists transactions_user_date_idx on public.transactions(user_id, date);
create unique index if not exists transactions_recurring_once
  on public.transactions(recurring_bill_id, recurring_month);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists transactions_touch on public.transactions;
create trigger transactions_touch before update on public.transactions
  for each row execute function public.touch_updated_at();

-- Segurança: cada linha pertence ao usuário logado
alter table public.categories        enable row level security;
alter table public.payment_methods   enable row level security;
alter table public.installment_plans enable row level security;
alter table public.recurring_bills   enable row level security;
alter table public.transactions      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['categories','payment_methods','installment_plans','recurring_bills','transactions'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Cria uma compra parcelada e todas as parcelas de uma vez (atômico).
-- O valor é dividido em centavos; a diferença do arredondamento vai na 1ª parcela.
create or replace function public.create_installment_plan(
  p_description text,
  p_creditor text,
  p_category_id uuid,
  p_payment_method_id uuid,
  p_total_amount numeric,
  p_installments int,
  p_first_due date,
  p_notes text,
  p_first_paid boolean default false
) returns uuid
language plpgsql security invoker as $$
declare
  v_plan uuid;
  v_cents bigint := round(p_total_amount * 100);
  v_base bigint;
  v_rest bigint;
  i int;
begin
  insert into public.installment_plans
    (description, creditor, category_id, payment_method_id, total_amount, installments, first_due, notes)
  values
    (p_description, p_creditor, p_category_id, p_payment_method_id, p_total_amount, p_installments, p_first_due, p_notes)
  returning id into v_plan;

  v_base := v_cents / p_installments;
  v_rest := v_cents - v_base * p_installments;

  for i in 1..p_installments loop
    insert into public.transactions
      (kind, amount, date, description, category_id, payment_method_id, paid, paid_at,
       installment_plan_id, installment_number)
    values
      ('expense',
       (v_base + case when i = 1 then v_rest else 0 end) / 100.0,
       (p_first_due + make_interval(months => i - 1))::date,
       p_description || ' (' || i || '/' || p_installments || ')',
       p_category_id, p_payment_method_id,
       (i = 1 and p_first_paid),
       case when i = 1 and p_first_paid then p_first_due end,
       v_plan, i);
  end loop;
  return v_plan;
end $$;

grant execute on function public.create_installment_plan(text, text, uuid, uuid, numeric, int, date, text, boolean) to authenticated;
