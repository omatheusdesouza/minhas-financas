-- Fynvault — migration 0008: painel do gestor e registros de segurança
--
-- Cole este arquivo inteiro no "SQL Editor" do Supabase e clique em "Run".
-- Só ACRESCENTA tabelas e funções: nenhum dado existente é apagado. Pode ser executado mais de uma vez.
-- Requer as migrations 0001 a 0007.
--
-- O que muda:
--  1. Lista de gestores (app_admins). Ninguém entra nela pelo app: só pelo SQL Editor (veja o fim do arquivo).
--  2. Registro de eventos de segurança (senhas erradas, códigos de convite errados, bloqueios da política de
--     segurança do site, ações do gestor), apagado sozinho depois de 90 dias.
--  3. Alertas automáticos quando algo foge do normal (ex.: 10 senhas erradas para o mesmo e-mail em 1 hora).
--  4. Limite no código de convite da família: 10 tentativas erradas por hora por pessoa.
--  5. Funções do painel do gestor. Elas NÃO mostram lançamentos, valores nem comprovantes de ninguém:
--     só dados da conta (e-mail, nome, datas de cadastro e de acesso) e de segurança.
--  6. Funções internas deixam de aceitar chamadas de visitantes não logados.

-- ---------------------------------------------------------------------------
-- 1. Gestores
-- ---------------------------------------------------------------------------
create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
-- sem políticas de propósito: a tabela não pode ser lida nem alterada pelo app

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid())
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito ao gestor.' using errcode = '42501';
  end if;
end $$;
revoke all on function public.require_admin() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Eventos e alertas de segurança (só as funções abaixo leem e gravam)
-- ---------------------------------------------------------------------------
create table if not exists public.security_events (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind       text not null check (kind in ('login_failed', 'login_ok', 'reset_requested', 'csp_violation',
                                           'invite_failed', 'invite_blocked', 'flood',
                                           'admin_block', 'admin_unblock', 'admin_delete')),
  email      text check (length(email) <= 254),
  user_id    uuid,
  ip         text check (length(ip) <= 64),
  user_agent text check (length(user_agent) <= 300),
  detail     text check (length(detail) <= 500)
);
create index if not exists security_events_time_idx  on public.security_events (created_at);
create index if not exists security_events_kind_idx  on public.security_events (kind, created_at);
create index if not exists security_events_email_idx on public.security_events (email, created_at);
create index if not exists security_events_ip_idx    on public.security_events (ip, created_at);
create index if not exists security_events_user_idx  on public.security_events (user_id, created_at);
alter table public.security_events enable row level security;

create table if not exists public.security_alerts (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  -- o mesmo alerta (regra + quem + dia) aparece uma vez só
  dedupe      text not null unique,
  level       text not null check (level in ('info', 'warn', 'critical')),
  title       text not null,
  detail      text,
  resolved_at timestamptz,
  -- quando a verificação diária do GitHub já avisou por e-mail
  notified_at timestamptz
);
create index if not exists security_alerts_open_idx on public.security_alerts (resolved_at, created_at);
alter table public.security_alerts enable row level security;

-- Endereço IP e navegador de quem fez a chamada (cabeçalhos repassados pelo Supabase)
create or replace function public.request_meta(out ip text, out agent text)
language plpgsql stable set search_path = public as $$
declare h json;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    h := null;
  end;
  ip := left(nullif(btrim(coalesce(h->>'cf-connecting-ip', h->>'x-real-ip', split_part(h->>'x-forwarded-for', ',', 1))), ''), 64);
  agent := left(h->>'user-agent', 300);
end $$;
revoke all on function public.request_meta() from public, anon, authenticated;

create or replace function public.raise_alert(p_key text, p_level text, p_title text, p_detail text)
returns void language sql security definer set search_path = public as $$
  insert into public.security_alerts (dedupe, level, title, detail)
  values (p_key || ':' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'), p_level, p_title, left(p_detail, 500))
  on conflict (dedupe) do nothing
$$;
revoke all on function public.raise_alert(text, text, text, text) from public, anon, authenticated;

-- Grava um evento e confere as regras de alerta. Uso interno.
create or replace function public.security_log(p_kind text, p_email text, p_detail text, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m record;
  em text := nullif(left(lower(btrim(p_email)), 254), '');
  n int;
begin
  select * into m from public.request_meta();
  insert into public.security_events (kind, email, user_id, ip, user_agent, detail)
  values (p_kind, em, p_user, m.ip, m.agent, left(p_detail, 500));

  if p_kind = 'login_failed' and em is not null then
    select count(*) into n from public.security_events
      where kind = 'login_failed' and email = em and created_at > now() - interval '1 hour';
    if n >= 10 then
      perform public.raise_alert('login_email:' || em, 'warn', 'Muitas senhas erradas para uma conta',
        format('%s tentativas erradas na última hora para %s. Pode ser alguém tentando adivinhar a senha.', n, em));
    end if;
  end if;
  if p_kind = 'login_failed' and m.ip is not null then
    select count(distinct email) into n from public.security_events
      where kind = 'login_failed' and ip = m.ip and created_at > now() - interval '1 hour';
    if n >= 5 then
      perform public.raise_alert('login_ip:' || m.ip, 'critical', 'Um mesmo endereço tentando entrar em várias contas',
        format('O IP %s errou a senha de %s contas diferentes na última hora.', m.ip, n));
    end if;
  end if;
  if p_kind = 'invite_blocked' then
    perform public.raise_alert('invite:' || coalesce(p_user::text, '?'), 'warn', 'Alguém tentando adivinhar código de convite',
      format('%s errou o código de convite da família 10 vezes em 1 hora e foi bloqueado por 1 hora.', coalesce(em, 'Um usuário')));
  end if;
  if p_kind = 'csp_violation' then
    perform public.raise_alert('csp', 'info', 'Código estranho bloqueado no site',
      'A proteção do site impediu um código de rodar: ' || coalesce(p_detail, '') || '. Costuma ser extensão do navegador; se repetir em várias pessoas, investigue.');
  end if;
  if p_kind = 'flood' then
    perform public.raise_alert('flood', 'critical', 'Volume anormal de tentativas',
      'Mais de 2.000 eventos de segurança em 10 minutos. O registro foi pausado para não lotar o banco. Pode ser um ataque automatizado.');
  end if;

  -- limpeza de vez em quando: eventos com mais de 90 dias e alertas resolvidos há mais de 180
  if random() < 0.02 then
    delete from public.security_events where created_at < now() - interval '90 days';
    delete from public.security_alerts where resolved_at < now() - interval '180 days';
  end if;
end $$;
revoke all on function public.security_log(text, text, text, uuid) from public, anon, authenticated;

-- Chamada pelo app (também antes do login, para registrar senha errada)
create or replace function public.log_security_event(p_kind text, p_email text default null, p_detail text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  m record;
  uid uuid := auth.uid();
  em text := p_email;
begin
  if p_kind not in ('login_failed', 'login_ok', 'reset_requested', 'csp_violation') then
    raise exception 'Evento inválido.';
  end if;
  if p_kind = 'login_ok' then
    if uid is null then return; end if;
    em := auth.jwt()->>'email'; -- acesso confirmado: o e-mail vem do login, não do app
  end if;
  select * into m from public.request_meta();
  -- no máximo 30 registros por endereço a cada 10 minutos
  if m.ip is not null and (select count(*) from public.security_events
                           where ip = m.ip and created_at > now() - interval '10 minutes') >= 30 then
    return;
  end if;
  -- trava geral contra enxurrada
  if (select count(*) from public.security_events where created_at > now() - interval '10 minutes') >= 2000 then
    if not exists (select 1 from public.security_events where kind = 'flood' and created_at > now() - interval '10 minutes') then
      perform public.security_log('flood', null, null, null);
    end if;
    return;
  end if;
  perform public.security_log(p_kind, em, p_detail, uid);
end $$;
revoke all on function public.log_security_event(text, text, text) from public;
grant execute on function public.log_security_event(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Convite da família com limite de tentativas
-- ---------------------------------------------------------------------------
-- Devolve {"owner": "..."} ou {"error": "mensagem"} (sem erro do banco, para o registro da tentativa valer)
create or replace function public.join_family(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  em text := auth.jwt()->>'email';
  inv public.family_invites;
  msg text;
begin
  if uid is null then return json_build_object('error', 'Faça login novamente.'); end if;
  if (select count(*) from public.security_events
      where user_id = uid and kind = 'invite_failed' and created_at > now() - interval '1 hour') >= 10 then
    if not exists (select 1 from public.security_events
                   where user_id = uid and kind = 'invite_blocked' and created_at > now() - interval '10 minutes') then
      perform public.security_log('invite_blocked', em, 'bloqueado por 1 hora', uid);
    end if;
    return json_build_object('error', 'Muitas tentativas com código errado. Aguarde 1 hora e tente de novo.');
  end if;

  select * into inv from public.family_invites where code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found then msg := 'Código de convite inválido.';
  elsif inv.used_by is not null then msg := 'Este convite já foi usado.';
  elsif inv.expires_at < now() then msg := 'Este convite expirou. Peça um novo.';
  elsif inv.owner_id = uid then return json_build_object('error', 'Você não pode aceitar o próprio convite.');
  end if;
  if msg is not null then
    perform public.security_log('invite_failed', em, msg, uid);
    return json_build_object('error', msg);
  end if;

  insert into public.family_members (owner_id, member_id, role) values (inv.owner_id, uid, inv.role)
    on conflict (owner_id, member_id) do update set role = excluded.role;
  update public.family_invites set used_by = uid, used_at = now() where code = inv.code;
  return json_build_object('owner', inv.owner_id);
end $$;
revoke all on function public.join_family(text) from public, anon;
grant execute on function public.join_family(text) to authenticated;

-- Função antiga (versões anteriores do app): passa pelo mesmo limite. Código errado devolve vazio.
create or replace function public.accept_family_invite(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare r json := public.join_family(p_code);
begin
  return nullif(r->>'owner', '')::uuid;
end $$;
revoke all on function public.accept_family_invite(text) from public, anon;
grant execute on function public.accept_family_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Painel do gestor (todas recusam quem não é gestor)
-- ---------------------------------------------------------------------------
create or replace function public.admin_overview() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return json_build_object(
    'users',       (select count(*) from auth.users),
    'new7',        (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'active30',    (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'unconfirmed', (select count(*) from auth.users where email_confirmed_at is null),
    'blocked',     (select count(*) from auth.users where banned_until > now()),
    'logins24',    (select count(*) from public.security_events where kind = 'login_ok' and created_at > now() - interval '1 day'),
    'failed24',    (select count(*) from public.security_events where kind = 'login_failed' and created_at > now() - interval '1 day'),
    'alerts',      (select count(*) from public.security_alerts where resolved_at is null),
    'signups',     (select coalesce(json_agg(json_build_object('day', d.day, 'n', d.n) order by d.day), '[]'::json) from (
                      select to_char(created_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as day, count(*) as n
                      from auth.users where created_at > now() - interval '30 days' group by 1) d)
  );
end $$;

create or replace function public.admin_users() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return (select coalesce(json_agg(r order by r.created_at desc), '[]'::json) from (
    select u.id, u.email::text as email, p.display_name as name, u.created_at, u.last_sign_in_at,
           u.email_confirmed_at is not null as confirmed,
           coalesce(u.banned_until > now(), false) as blocked,
           exists (select 1 from public.app_admins a where a.user_id = u.id) as admin,
           (select count(*) from public.family_members f where f.owner_id = u.id)::int as shares,
           (select count(*) from public.family_members f where f.member_id = u.id)::int as member_of,
           (select count(*) from public.security_events e
             where e.kind = 'login_failed' and e.email = lower(u.email) and e.created_at > now() - interval '1 day')::int as failed24
    from auth.users u left join public.profiles p on p.user_id = u.id
  ) r);
end $$;

create or replace function public.admin_events(p_kind text default null, p_days int default 7) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return (select coalesce(json_agg(e order by e.created_at desc), '[]'::json) from (
    select * from public.security_events
    where (p_kind is null or kind = p_kind) and created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90))
    order by created_at desc limit 500
  ) e);
end $$;

create or replace function public.admin_alerts(p_all boolean default false) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return (select coalesce(json_agg(a order by a.resolved_at nulls first, a.created_at desc), '[]'::json) from (
    select id, created_at, level, title, detail, resolved_at from public.security_alerts
    where resolved_at is null or (p_all and created_at > now() - interval '90 days')
    order by created_at desc limit 300
  ) a);
end $$;

create or replace function public.admin_resolve_alert(p_id bigint default null, p_all boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.security_alerts set resolved_at = now()
    where resolved_at is null and (p_all or id = p_id);
end $$;

-- Bloquear: a pessoa não consegue mais entrar e os aparelhos dela saem da conta (em até 1 hora)
create or replace function public.admin_set_blocked(p_user uuid, p_block boolean) returns void
language plpgsql security definer set search_path = public as $$
declare em text;
begin
  perform public.require_admin();
  if p_user = auth.uid() then raise exception 'Você não pode bloquear a própria conta.'; end if;
  if exists (select 1 from public.app_admins where user_id = p_user) then
    raise exception 'Não é possível bloquear outro gestor.';
  end if;
  update auth.users set banned_until = case when p_block then now() + interval '100 years' else null end
    where id = p_user returning email into em;
  if not found then raise exception 'Conta não encontrada.'; end if;
  if p_block then
    begin
      delete from auth.sessions where user_id = p_user;
    exception when others then
      null; -- versão do Supabase sem a tabela de sessões: o bloqueio vale na próxima renovação do login
    end;
  end if;
  perform public.security_log(case when p_block then 'admin_block' else 'admin_unblock' end, em,
    'pelo gestor ' || coalesce(auth.jwt()->>'email', ''), p_user);
end $$;

-- Excluir conta (ex.: pedido do titular pela LGPD ou conta falsa). Fotos e comprovantes ficam no Storage,
-- porque o Supabase não deixa apagar arquivos por SQL: a função diz quantos sobraram.
create or replace function public.admin_delete_user(p_user uuid) returns json
language plpgsql security definer set search_path = public as $$
declare
  em text;
  files int := 0;
begin
  perform public.require_admin();
  if p_user = auth.uid() then raise exception 'Para excluir a própria conta, use Ajustes › Privacidade e dados.'; end if;
  if exists (select 1 from public.app_admins where user_id = p_user) then
    raise exception 'Não é possível excluir outro gestor.';
  end if;
  select email into em from auth.users where id = p_user;
  if not found then raise exception 'Conta não encontrada.'; end if;
  begin
    select count(*) into files from storage.objects
      where bucket_id in ('avatars', 'receipts') and (storage.foldername(name))[1] = p_user::text;
  exception when others then
    files := 0;
  end;
  perform public.security_log('admin_delete', em, 'pelo gestor ' || coalesce(auth.jwt()->>'email', ''), p_user);
  delete from auth.users where id = p_user;
  delete from public.deleted_rows where user_id = p_user;
  return json_build_object('files', files);
end $$;

do $$
declare f text;
begin
  foreach f in array array['admin_overview()', 'admin_users()', 'admin_events(text, int)', 'admin_alerts(boolean)',
                           'admin_resolve_alert(bigint, boolean)', 'admin_set_blocked(uuid, boolean)', 'admin_delete_user(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Funções antigas: só para quem está logado
-- ---------------------------------------------------------------------------
revoke all on function public.can_access(uuid, text) from public, anon;
grant execute on function public.can_access(uuid, text) to authenticated;
revoke all on function public.same_family(uuid) from public, anon;
grant execute on function public.same_family(uuid) to authenticated;
revoke all on function public.create_installment_plan(text, text, uuid, uuid, numeric, int, date, text, boolean) from public, anon;
grant execute on function public.create_installment_plan(text, text, uuid, uuid, numeric, int, date, text, boolean) to authenticated;

insert into public.app_migrations(version) values ('0008') on conflict do nothing;

-- ---------------------------------------------------------------------------
-- DEPOIS DE RODAR: torne-se gestor (uma vez só). Troque pelo e-mail com que você entra no app,
-- selecione SÓ esta linha (sem os dois tracinhos do começo) e clique em "Run":
--
-- insert into public.app_admins (user_id) select id from auth.users where email = 'SEU-EMAIL@exemplo.com' on conflict do nothing;
-- ---------------------------------------------------------------------------
