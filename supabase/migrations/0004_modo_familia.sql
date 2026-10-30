-- Fynvault — migration 0004: modo família (compartilhar as finanças com outra pessoa)
--
-- Cole este arquivo inteiro no "SQL Editor" do Supabase e clique em "Run".
-- Só ACRESCENTA tabelas, funções e regras: nenhum dado existente é apagado.
-- Pode ser executado mais de uma vez. Requer as migrations 0001, 0002 e 0003.
--
-- Como funciona:
--  - O dono do espaço convida alguém por um código de 6 caracteres (válido por 7 dias, uso único).
--  - Papéis: 'editor' (pode lançar e editar no espaço do dono) ou 'viewer' (só visualiza).
--  - Quem não é membro continua sem acesso nenhum. O dono pode mudar o papel ou remover; o membro pode sair.

-- ---------------------------------------------------------------------------
-- 1. Membros e convites
-- ---------------------------------------------------------------------------
create table if not exists public.family_members (
  owner_id    uuid not null references auth.users(id) on delete cascade,
  member_id   uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('editor', 'viewer')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (owner_id, member_id),
  check (owner_id <> member_id)
);
create index if not exists family_members_member_idx on public.family_members(member_id);

drop trigger if exists family_members_touch on public.family_members;
create trigger family_members_touch before update on public.family_members
  for each row execute function public.touch_updated_at();

create table if not exists public.family_invites (
  code        text primary key check (code ~ '^[A-Z2-9]{6}$'),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role        text not null check (role in ('editor', 'viewer')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  used_by     uuid references auth.users(id) on delete set null,
  used_at     timestamptz
);
create index if not exists family_invites_owner_idx on public.family_invites(owner_id);

-- ---------------------------------------------------------------------------
-- 2. Quem pode acessar o espaço de quem
-- ---------------------------------------------------------------------------
-- need = 'read' (ver) ou 'write' (alterar). O próprio dono sempre pode.
create or replace function public.can_access(owner uuid, need text) returns boolean
language sql stable security definer set search_path = public as $$
  select owner = auth.uid() or exists (
    select 1 from public.family_members m
    where m.owner_id = owner and m.member_id = auth.uid()
      and (need = 'read' or m.role = 'editor')
  )
$$;

-- Duas pessoas estão na mesma família (para verem nome e foto uma da outra)
create or replace function public.same_family(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select other = auth.uid() or exists (
    select 1 from public.family_members m
    where (m.owner_id = auth.uid() and m.member_id = other) or (m.owner_id = other and m.member_id = auth.uid())
  )
$$;

grant execute on function public.can_access(uuid, text) to authenticated;
grant execute on function public.same_family(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Regras de segurança dos dados: dono OU membro (editor para alterar)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['categories','payment_methods','installment_plans','recurring_bills',
                           'transactions','savings_goals','goal_contributions'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('drop policy if exists "family read" on public.%I', t);
    execute format('drop policy if exists "family insert" on public.%I', t);
    execute format('drop policy if exists "family update" on public.%I', t);
    execute format('drop policy if exists "family delete" on public.%I', t);
    execute format('create policy "family read" on public.%I for select to authenticated
                      using (public.can_access(user_id, ''read''))', t);
    execute format('create policy "family insert" on public.%I for insert to authenticated
                      with check (public.can_access(user_id, ''write''))', t);
    execute format('create policy "family update" on public.%I for update to authenticated
                      using (public.can_access(user_id, ''write'')) with check (public.can_access(user_id, ''write''))', t);
    execute format('create policy "family delete" on public.%I for delete to authenticated
                      using (public.can_access(user_id, ''write''))', t);
  end loop;
end $$;

-- Perfis: cada um altera só o seu; membros da mesma família veem nome e foto
drop policy if exists "own profile" on public.profiles;
drop policy if exists "profile read" on public.profiles;
drop policy if exists "profile write" on public.profiles;
create policy "profile read" on public.profiles for select to authenticated
  using (public.same_family(user_id));
create policy "profile write" on public.profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Exclusões: membros também recebem as do espaço compartilhado
drop policy if exists "own deletions" on public.deleted_rows;
create policy "own deletions" on public.deleted_rows for select to authenticated
  using (public.can_access(user_id, 'read'));

-- Membros: o dono vê/altera/remove os seus; o membro vê e pode sair. Entrar só pelo convite.
alter table public.family_members enable row level security;
drop policy if exists "family members read" on public.family_members;
drop policy if exists "family members owner update" on public.family_members;
drop policy if exists "family members leave or remove" on public.family_members;
create policy "family members read" on public.family_members for select to authenticated
  using (owner_id = auth.uid() or member_id = auth.uid());
create policy "family members owner update" on public.family_members for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "family members leave or remove" on public.family_members for delete to authenticated
  using (owner_id = auth.uid() or member_id = auth.uid());

-- Convites: só o dono vê, cria e cancela os seus
alter table public.family_invites enable row level security;
drop policy if exists "own invites" on public.family_invites;
create policy "own invites" on public.family_invites for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and used_by is null);

-- Aceitar convite (a pessoa convidada não enxerga a tabela de convites: só usa esta função)
create or replace function public.accept_family_invite(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.family_invites;
begin
  if auth.uid() is null then raise exception 'Faça login novamente.'; end if;
  select * into inv from public.family_invites where code = upper(trim(p_code)) for update;
  if not found then raise exception 'Código de convite inválido.'; end if;
  if inv.used_by is not null then raise exception 'Este convite já foi usado.'; end if;
  if inv.expires_at < now() then raise exception 'Este convite expirou. Peça um novo.'; end if;
  if inv.owner_id = auth.uid() then raise exception 'Você não pode aceitar o próprio convite.'; end if;
  insert into public.family_members (owner_id, member_id, role) values (inv.owner_id, auth.uid(), inv.role)
    on conflict (owner_id, member_id) do update set role = excluded.role;
  update public.family_invites set used_by = auth.uid(), used_at = now() where code = inv.code;
  return inv.owner_id;
end $$;
grant execute on function public.accept_family_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Arquivos: membros veem fotos da família e comprovantes do espaço compartilhado
-- ---------------------------------------------------------------------------
do $$
begin
  drop policy if exists "avatars: dono lê" on storage.objects;
  create policy "avatars: dono lê" on storage.objects for select to authenticated
    using (bucket_id = 'avatars' and public.same_family(((storage.foldername(name))[1])::uuid));

  drop policy if exists "receipts: dono lê" on storage.objects;
  drop policy if exists "receipts: dono envia" on storage.objects;
  drop policy if exists "receipts: dono apaga" on storage.objects;
  create policy "receipts: dono lê" on storage.objects for select to authenticated
    using (bucket_id = 'receipts' and public.can_access(((storage.foldername(name))[1])::uuid, 'read'));
  create policy "receipts: dono envia" on storage.objects for insert to authenticated
    with check (bucket_id = 'receipts' and public.can_access(((storage.foldername(name))[1])::uuid, 'write'));
  create policy "receipts: dono apaga" on storage.objects for delete to authenticated
    using (bucket_id = 'receipts' and public.can_access(((storage.foldername(name))[1])::uuid, 'write'));
end $$;

insert into public.app_migrations(version) values ('0004') on conflict do nothing;
