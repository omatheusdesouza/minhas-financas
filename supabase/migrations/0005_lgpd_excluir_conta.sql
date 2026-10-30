-- Fynvault — migration 0005: LGPD — o próprio usuário pode excluir a conta e todos os dados
--
-- Cole este arquivo inteiro no "SQL Editor" do Supabase e clique em "Run".
-- Só ACRESCENTA uma função: nenhum dado existente é apagado ao rodar esta migration.
-- Pode ser executado mais de uma vez. Requer as migrations 0001 a 0004.
--
-- Como funciona (Ajustes › Privacidade e dados › Excluir minha conta):
--  1. O app apaga a foto e os comprovantes do usuário pela API do Storage (o Supabase não deixa apagar
--     arquivos por SQL).
--  2. O app chama delete_my_account(true). A função apaga SOMENTE a conta de quem está logado
--     (auth.uid()); todas as tabelas do app apontam para auth.users com "on delete cascade", então
--     lançamentos, categorias, metas, perfil, compartilhamentos e convites vão junto.
--  3. Por fim, limpa o registro de exclusões (deleted_rows) desse usuário, que não tem chave estrangeira.
-- Chamada com false, a função não apaga nada: só confirma que existe (o app testa antes de apagar arquivos).

create or replace function public.delete_my_account(confirm boolean default false) returns boolean
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Faça login para excluir a conta.';
  end if;
  if not confirm then
    return false;
  end if;
  delete from auth.users where id = uid;
  delete from public.deleted_rows where user_id = uid;
  return true;
end $$;

revoke all on function public.delete_my_account(boolean) from public, anon;
grant execute on function public.delete_my_account(boolean) to authenticated;

insert into public.app_migrations(version) values ('0005') on conflict do nothing;
