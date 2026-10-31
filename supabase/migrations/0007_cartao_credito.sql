-- Fynvault — migration 0007: cartão de crédito com fatura
--
-- Cole este arquivo inteiro no "SQL Editor" do Supabase e clique em "Run".
-- Só ACRESCENTA colunas (todas opcionais ou com valor padrão): nenhum dado existente é apagado ou alterado.
-- Pode ser executado mais de uma vez. Requer as migrations 0001 a 0006.
--
-- Como funciona:
--  - Uma forma de pagamento pode ser um cartão de crédito (type = 'credit_card'), com dia de fechamento,
--    dia de vencimento e limite (opcional).
--  - Uma compra no cartão é um lançamento com payment_method_id = cartão. A coluna `date` guarda o
--    VENCIMENTO da fatura em que a compra cai (por isso ela conta no mês da fatura) e `purchase_date`
--    guarda a data em que a compra foi feita. Compras antigas ficam com purchase_date nulo.
--  - A fatura não é uma tabela: é o conjunto das compras do cartão com o mesmo vencimento.
--    Pagar a fatura = marcar essas compras como pagas.

-- 1. Cartões
alter table public.payment_methods add column if not exists type text not null default 'other';
alter table public.payment_methods add column if not exists closing_day int;
alter table public.payment_methods add column if not exists due_day int;
alter table public.payment_methods add column if not exists credit_limit numeric(14,2);

alter table public.payment_methods drop constraint if exists payment_methods_type_check;
alter table public.payment_methods add constraint payment_methods_type_check
  check (type in ('other', 'credit_card'));
alter table public.payment_methods drop constraint if exists payment_methods_card_days_check;
alter table public.payment_methods add constraint payment_methods_card_days_check
  check (
    (closing_day is null or closing_day between 1 and 31)
    and (due_day is null or due_day between 1 and 31)
    and (type <> 'credit_card' or (closing_day is not null and due_day is not null))
  );
alter table public.payment_methods drop constraint if exists payment_methods_credit_limit_check;
alter table public.payment_methods add constraint payment_methods_credit_limit_check
  check (credit_limit is null or credit_limit > 0);

-- 2. Data da compra (o `date` de uma compra no cartão é o vencimento da fatura)
alter table public.transactions add column if not exists purchase_date date;
create index if not exists transactions_card_idx on public.transactions(payment_method_id, date)
  where purchase_date is not null;

insert into public.app_migrations(version) values ('0007') on conflict do nothing;
