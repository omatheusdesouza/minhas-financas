-- Fynvault — migration 0010: cartão (ou forma de pagamento) ligado a uma conta do caixa
--
-- Cole este arquivo inteiro no "SQL Editor" do Supabase e clique em "Run".
-- Só ACRESCENTA uma coluna opcional e uma regra: nenhum dado existente é apagado ou alterado.
-- Pode ser executado mais de uma vez. Requer as migrations 0001 a 0009.
--
-- Como funciona:
--  - payment_methods.account_id = a conta (Nubank, Itaú...) de onde sai o dinheiro desse cartão ou forma.
--  - Cartão de débito, Pix etc. ligados a uma conta: o que é pago com eles desconta dessa conta no caixa.
--  - Cartão de crédito ligado a uma conta: a fatura sai dessa conta (o app já a sugere ao pagar).
--  - Se a conta for excluída, o cartão continua existindo, só fica sem conta ligada.

alter table public.payment_methods add column if not exists account_id uuid;

-- a conta ligada é do mesmo dono; excluída a conta, só a ligação some
alter table public.payment_methods drop constraint if exists payment_methods_account_link_fkey;
alter table public.payment_methods add constraint payment_methods_account_link_fkey
  foreign key (account_id, user_id) references public.payment_methods(id, user_id) on delete set null (account_id);

alter table public.payment_methods drop constraint if exists payment_methods_account_link_check;
alter table public.payment_methods add constraint payment_methods_account_link_check
  check (account_id is null or (account_id <> id and type <> 'account'));

create index if not exists payment_methods_account_link_idx on public.payment_methods (account_id) where account_id is not null;

-- só uma CONTA pode receber cartões ligados
create or replace function public.check_account_link() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.account_id is not null and not exists (
    select 1 from public.payment_methods where id = new.account_id and type = 'account'
  ) then
    raise exception 'O cartão só pode ser ligado a uma conta do caixa.';
  end if;
  return new;
end $$;

drop trigger if exists payment_methods_account_link on public.payment_methods;
create trigger payment_methods_account_link before insert or update of account_id on public.payment_methods
  for each row execute function public.check_account_link();

insert into public.app_migrations(version) values ('0010') on conflict do nothing;
