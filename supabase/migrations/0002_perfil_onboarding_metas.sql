-- Fynvault — migration 0002: perfil, onboarding, contas variáveis, comprovantes e metas
--
-- Cole este arquivo inteiro no "SQL Editor" do Supabase e clique em "Run".
-- Só ACRESCENTA tabelas, colunas e regras: nenhum dado existente é apagado ou alterado,
-- exceto marcar todas as contas fixas atuais como "valor fixo" (que é o que elas já são).
-- Pode ser executado mais de uma vez sem problema.

-- Controle das migrations (caso a 0001 tenha sido aplicada antes de existir este controle)
create table if not exists public.app_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now()
);
alter table public.app_migrations enable row level security;
insert into public.app_migrations(version) values ('0001') on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 1. Perfil
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id        uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name   text not null check (length(btrim(display_name)) between 1 and 40),
  avatar_emoji   text check (avatar_emoji is null or length(avatar_emoji) <= 16),
  avatar_path    text check (avatar_path is null or length(avatar_path) <= 300),
  reminder_time  time not null default '09:00',
  onboarding_completed_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Contas fixas: valor fixo ou variável, e origem da renda
-- ---------------------------------------------------------------------------
alter table public.recurring_bills
  add column if not exists amount_type text not null default 'fixed',
  add column if not exists income_source text;

-- Contas variáveis (água, energia...) podem não ter valor; nesse caso ele é informado a cada mês.
alter table public.recurring_bills alter column amount drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recurring_bills_amount_type_check') then
    alter table public.recurring_bills add constraint recurring_bills_amount_type_check
      check (amount_type in ('fixed', 'variable'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recurring_bills_amount_required') then
    alter table public.recurring_bills add constraint recurring_bills_amount_required
      check (amount_type = 'variable' or amount is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recurring_bills_income_source_check') then
    alter table public.recurring_bills add constraint recurring_bills_income_source_check
      check (income_source is null or income_source in ('trabalho', 'aluguel', 'pensao', 'beneficio', 'outro'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Lançamentos: valor a informar (contas variáveis) e comprovante
-- ---------------------------------------------------------------------------
alter table public.transactions
  add column if not exists receipt_path text;

alter table public.transactions alter column amount drop not null;

do $$
begin
  -- Só uma conta ainda NÃO paga pode ficar sem valor
  if not exists (select 1 from pg_constraint where conname = 'transactions_amount_required') then
    alter table public.transactions add constraint transactions_amount_required
      check (amount is not null or paid = false);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_receipt_path_check') then
    alter table public.transactions add constraint transactions_receipt_path_check
      check (receipt_path is null or length(receipt_path) <= 300);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Metas de economia e aportes
-- ---------------------------------------------------------------------------
create table if not exists public.savings_goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 60),
  icon          text not null default '🎯',
  color         text not null default '#B8964F',
  target_amount numeric(14,2) not null check (target_amount > 0),
  monthly_contribution numeric(14,2) check (monthly_contribution is null or monthly_contribution > 0),
  contribution_day int check (contribution_day is null or contribution_day between 1 and 31),
  target_date   date,
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists savings_goals_user_idx on public.savings_goals(user_id);

drop trigger if exists savings_goals_touch on public.savings_goals;
create trigger savings_goals_touch before update on public.savings_goals
  for each row execute function public.touch_updated_at();

create table if not exists public.goal_contributions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id     uuid not null,
  amount      numeric(14,2) not null check (amount > 0),
  date        date not null default current_date,
  note        text check (note is null or length(note) <= 200),
  created_at  timestamptz not null default now(),
  -- o aporte só pode apontar para uma meta do mesmo usuário
  foreign key (goal_id, user_id) references public.savings_goals(id, user_id) on delete cascade
);
create index if not exists goal_contributions_goal_idx on public.goal_contributions(goal_id);

-- ---------------------------------------------------------------------------
-- 5. Segurança (RLS) nas tabelas novas: cada usuário só acessa as próprias linhas
-- ---------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.savings_goals      enable row level security;
alter table public.goal_contributions enable row level security;

do $$
declare t text;
begin
  foreach t in array array['savings_goals', 'goal_contributions'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 6. Arquivos: fotos de perfil e comprovantes em buckets PRIVADOS.
--    Caminho obrigatório: <id do usuário>/<arquivo>. Só o dono lê, envia ou apaga.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',  'avatars',  false, 5242880,  array['image/jpeg', 'image/png', 'image/webp']),
  ('receipts', 'receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
declare b text;
begin
  foreach b in array array['avatars', 'receipts'] loop
    execute format('drop policy if exists "%s: dono lê" on storage.objects', b);
    execute format('drop policy if exists "%s: dono envia" on storage.objects', b);
    execute format('drop policy if exists "%s: dono altera" on storage.objects', b);
    execute format('drop policy if exists "%s: dono apaga" on storage.objects', b);
    execute format(
      'create policy "%s: dono lê" on storage.objects for select to authenticated
         using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)', b, b);
    execute format(
      'create policy "%s: dono envia" on storage.objects for insert to authenticated
         with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)', b, b);
    execute format(
      'create policy "%s: dono altera" on storage.objects for update to authenticated
         using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)
         with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)', b, b, b);
    execute format(
      'create policy "%s: dono apaga" on storage.objects for delete to authenticated
         using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)', b, b);
  end loop;
end $$;

insert into public.app_migrations(version) values ('0002') on conflict do nothing;
