-- Fynvault — migration 0011: prioridade dos pagamentos (pagamentos recomendados)
--
-- Cole este arquivo inteiro no "SQL Editor" do Supabase e clique em "Run".
-- Só ACRESCENTA colunas opcionais: nenhum dado existente é apagado ou alterado.
-- Pode ser executado mais de uma vez. Requer as migrations 0001 a 0010.
--
-- Níveis: 1 = Essencial (não pode atrasar), 2 = Alta (juros e multa altos), 3 = Normal, 4 = Flexível (dá para adiar).
-- Vazio = o app sugere o nível pela categoria. A prioridade de um lançamento vale só para ele; a de uma conta fixa vale
-- para todos os meses dela; a de uma categoria vale para todas as contas da categoria.

alter table public.categories add column if not exists priority smallint;
alter table public.recurring_bills add column if not exists priority smallint;
alter table public.transactions add column if not exists priority smallint;

alter table public.categories drop constraint if exists categories_priority_check;
alter table public.categories add constraint categories_priority_check check (priority is null or priority between 1 and 4);
alter table public.recurring_bills drop constraint if exists recurring_bills_priority_check;
alter table public.recurring_bills add constraint recurring_bills_priority_check check (priority is null or priority between 1 and 4);
alter table public.transactions drop constraint if exists transactions_priority_check;
alter table public.transactions add constraint transactions_priority_check check (priority is null or priority between 1 and 4);

insert into public.app_migrations(version) values ('0011') on conflict do nothing;
