-- Fynvault — migration 0003: sincronização offline
--
-- Cole este arquivo inteiro no "SQL Editor" do Supabase e clique em "Run".
-- Só ACRESCENTA colunas, uma tabela e regras: nenhum dado existente é apagado.
-- É compatível com as versões anteriores do app e pode ser executada mais de uma vez.
--
--  - updated_at em todas as tabelas: saber o que mudou desde a última sincronização.
--  - client_updated_at: horário da edição no aparelho. Vale a edição mais recente;
--    uma edição mais antiga que chegue atrasada (aparelho que estava offline) é ignorada.
--  - deleted_rows: registro de exclusões, para que o outro aparelho apague também.

-- ---------------------------------------------------------------------------
-- 1. updated_at onde ainda não existe (valor inicial = data de criação)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['categories', 'payment_methods', 'installment_plans', 'recurring_bills', 'goal_contributions'] loop
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = t and column_name = 'updated_at') then
      execute format('alter table public.%I add column updated_at timestamptz', t);
      execute format('update public.%I set updated_at = created_at', t);
      execute format('alter table public.%I alter column updated_at set default now()', t);
      execute format('alter table public.%I alter column updated_at set not null', t);
    end if;
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I
                      for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. client_updated_at + regra "vale a edição mais recente"
-- ---------------------------------------------------------------------------
create or replace function public.skip_stale_update() returns trigger
language plpgsql as $$
begin
  -- Edição feita no aparelho ANTES da versão que já está salva: ignora (não sobrescreve a mais nova)
  if new.client_updated_at is not null and old.client_updated_at is not null
     and new.client_updated_at < old.client_updated_at then
    return null;
  end if;
  -- Versões antigas do app não informam o horário: conta como edição feita agora
  if new.client_updated_at is null or new.client_updated_at = old.client_updated_at then
    new.client_updated_at := now();
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['categories', 'payment_methods', 'installment_plans', 'recurring_bills',
                           'transactions', 'profiles', 'savings_goals', 'goal_contributions'] loop
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = t and column_name = 'client_updated_at') then
      execute format('alter table public.%I add column client_updated_at timestamptz', t);
      execute format('update public.%I set client_updated_at = coalesce(updated_at, created_at)', t);
      execute format('alter table public.%I alter column client_updated_at set default now()', t);
    end if;
    -- o nome começa com "00" para rodar antes do gatilho que atualiza updated_at
    execute format('drop trigger if exists %I on public.%I', t || '_00_stale', t);
    execute format('create trigger %I before update on public.%I
                      for each row execute function public.skip_stale_update()', t || '_00_stale', t);
    -- busca rápida do que mudou desde a última sincronização
    execute format('create index if not exists %I on public.%I (user_id, updated_at)', t || '_sync_idx', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Registro de exclusões (preenchido só pelo banco; cada um lê só as suas)
-- ---------------------------------------------------------------------------
create table if not exists public.deleted_rows (
  id          bigserial primary key,
  user_id     uuid not null,
  table_name  text not null,
  row_id      uuid not null,
  deleted_at  timestamptz not null default now()
);
create index if not exists deleted_rows_sync_idx on public.deleted_rows (user_id, deleted_at);

alter table public.deleted_rows enable row level security;
drop policy if exists "own deletions" on public.deleted_rows;
create policy "own deletions" on public.deleted_rows for select to authenticated
  using (user_id = auth.uid());
-- sem políticas de insert/update/delete: o app não consegue escrever nesta tabela

create or replace function public.log_deletion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.deleted_rows (user_id, table_name, row_id) values (old.user_id, tg_table_name, old.id);
  return old;
end $$;

do $$
declare t text;
begin
  foreach t in array array['categories', 'payment_methods', 'installment_plans', 'recurring_bills',
                           'transactions', 'savings_goals', 'goal_contributions'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_log_delete', t);
    execute format('create trigger %I after delete on public.%I
                      for each row execute function public.log_deletion()', t || '_log_delete', t);
  end loop;
end $$;

insert into public.app_migrations(version) values ('0003') on conflict do nothing;
