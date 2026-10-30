-- Fynvault — migration 0006: reservas (dinheiro guardado) e retiradas
--
-- Cole este arquivo inteiro no "SQL Editor" do Supabase e clique em "Run".
-- Não apaga nem altera nenhum dado: afrouxa duas regras, acrescenta uma coluna (com valor padrão) e cria
-- uma função de consulta.
-- Pode ser executado mais de uma vez. Requer as migrations 0001 a 0005.
--
-- Como funciona:
--  - Uma RESERVA é uma linha de savings_goals sem valor-alvo (target_amount nulo). As metas continuam
--    exigindo um alvo maior que zero; as reservas simplesmente não têm.
--  - As entradas e saídas ficam em goal_contributions: valor positivo = entrada, negativo = retirada
--    (zero continua proibido). Vale para reservas e para metas.
--  - goal_contributions.kind diz a origem do movimento: 'move' (entrada/retirada do dia a dia, entra no
--    "Enviado para reservas" do mês), 'initial' (saldo que já existia ao criar) ou 'adjust' (ajuste de saldo).
--    Os dois últimos mudam o saldo, mas não contam como dinheiro do mês.
--  - app_schema_version() devolve a última migration aplicada, para o app só oferecer as reservas
--    quando este banco já aceitar esses dados.

-- 1. Valor-alvo opcional (reservas)
alter table public.savings_goals alter column target_amount drop not null;
alter table public.savings_goals drop constraint if exists savings_goals_target_amount_check;
alter table public.savings_goals add constraint savings_goals_target_amount_check
  check (target_amount is null or target_amount > 0);

-- 2. Retiradas (valores negativos)
alter table public.goal_contributions drop constraint if exists goal_contributions_amount_check;
alter table public.goal_contributions add constraint goal_contributions_amount_check
  check (amount <> 0);

-- 3. Origem do movimento
alter table public.goal_contributions add column if not exists kind text not null default 'move';
alter table public.goal_contributions drop constraint if exists goal_contributions_kind_check;
alter table public.goal_contributions add constraint goal_contributions_kind_check
  check (kind in ('move', 'initial', 'adjust'));

-- 4. Versão do banco, para o app
insert into public.app_migrations(version) values ('0006') on conflict do nothing;

create or replace function public.app_schema_version() returns text
language sql stable security definer set search_path = public as $$
  select max(version) from public.app_migrations
$$;
revoke all on function public.app_schema_version() from public, anon;
grant execute on function public.app_schema_version() to authenticated;
