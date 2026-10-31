import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Field, Segmented } from '../components/Fields'
import { Icon } from '../components/Icon'
import { Sheet } from '../components/Sheet'
import { ago, device, EVENT_LABEL, filterUsers, topBy, when, type UserFilter } from '../lib/admin'
import { api } from '../lib/api'
import type { AdminOverview, AdminUser, SecurityAlert, SecurityEvent, SecurityEventKind } from '../lib/backend'
import { useApp } from '../store'

type Tab = 'geral' | 'pessoas' | 'seguranca' | 'alertas'

/**
 * Painel do gestor: contas, tentativas de acesso e alertas de segurança.
 * Não mostra lançamentos, valores nem comprovantes de ninguém (LGPD). Todo acesso é conferido no banco.
 */
export default function AdminScreen() {
  const sec = api.security
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [tab, setTab] = useState<Tab>('geral')
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const loadOverview = useCallback(async () => {
    if (!sec) return
    setLoading(true)
    setError('')
    try {
      setOverview(await sec.overview())
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }, [sec])

  useEffect(() => {
    if (!sec) { setAllowed(false); return }
    sec.isAdmin().then((ok) => { setAllowed(ok); if (ok) loadOverview() })
  }, [sec, loadOverview])

  if (allowed === null) return <div className="screen"><div className="spinner" /></div>
  if (!allowed) {
    return (
      <div className="screen narrow">
        <header className="top"><Link to="/ajustes" className="icon-btn" aria-label="Voltar"><Icon name="left" /></Link><h1>Gestor</h1><span /></header>
        <p className="note">Esta área é só para o gestor do app.</p>
      </div>
    )
  }

  return (
    <div className="screen admin-screen">
      <header className="top">
        <Link to="/ajustes" className="icon-btn back-home" aria-label="Voltar"><Icon name="left" /></Link>
        <h1>Painel do gestor</h1>
        <button className="icon-btn" onClick={loadOverview} aria-label="Atualizar" title="Atualizar" disabled={loading}><Icon name="repeat" /></button>
      </header>
      <p className="muted small">🔒 Você vê dados de conta e de segurança. Lançamentos e valores das pessoas não aparecem aqui.</p>

      <Segmented value={tab} onChange={setTab} options={[
        { value: 'geral', label: 'Visão geral' },
        { value: 'pessoas', label: 'Pessoas' },
        { value: 'seguranca', label: 'Acessos' },
        { value: 'alertas', label: overview?.alerts ? `Alertas (${overview.alerts})` : 'Alertas' },
      ]} />
      {error && <p className="alert">{error}</p>}

      {tab === 'geral' && <OverviewTab o={overview} go={setTab} />}
      {tab === 'pessoas' && <PeopleTab onChanged={loadOverview} />}
      {tab === 'seguranca' && <EventsTab />}
      {tab === 'alertas' && <AlertsTab onChanged={loadOverview} />}
    </div>
  )
}

function OverviewTab({ o, go }: { o: AdminOverview | null; go: (t: Tab) => void }) {
  if (!o) return <div className="spinner" />
  const max = Math.max(1, ...o.signups.map((s) => s.n))
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
    return { day: d, n: o.signups.find((s) => s.day === d)?.n ?? 0 }
  })
  const tiles: [string, number, string, Tab | null][] = [
    ['Pessoas cadastradas', o.users, '', 'pessoas'],
    ['Novas em 7 dias', o.new7, '', 'pessoas'],
    ['Ativas em 30 dias', o.active30, '', 'pessoas'],
    ['Sem confirmar e-mail', o.unconfirmed, o.unconfirmed ? 'warn' : '', 'pessoas'],
    ['Contas bloqueadas', o.blocked, o.blocked ? 'bad' : '', 'pessoas'],
    ['Acessos em 24 h', o.logins24, '', 'seguranca'],
    ['Senhas erradas em 24 h', o.failed24, o.failed24 >= 10 ? 'warn' : '', 'seguranca'],
    ['Alertas abertos', o.alerts, o.alerts ? 'bad' : 'good', 'alertas'],
  ]
  return (
    <>
      {o.alerts > 0 && (
        <button className="card admin-banner" onClick={() => go('alertas')}>
          <Icon name="alert" /> <b>{o.alerts} alerta(s) de segurança para ver</b> <Icon name="right" className="end" />
        </button>
      )}
      <div className="admin-tiles">
        {tiles.map(([label, n, tone, to]) => (
          <button key={label} className={`card stat admin-tile ${tone}`} onClick={() => to && go(to)}>
            <span className="stat-label">{label}</span>
            <strong>{n.toLocaleString('pt-BR')}</strong>
          </button>
        ))}
      </div>
      <section className="card">
        <h3>Cadastros nos últimos 30 dias</h3>
        <div className="admin-bars" role="img" aria-label={`Cadastros por dia: ${days.map((d) => d.n).join(', ')}`}>
          {days.map((d) => (
            <span key={d.day} title={`${d.day.split('-').reverse().join('/')}: ${d.n}`} style={{ height: `${Math.max(4, (d.n / max) * 100)}%` }} className={d.n ? 'on' : ''} />
          ))}
        </div>
        <p className="muted small">Total no período: {days.reduce((s, d) => s + d.n, 0)}</p>
      </section>
    </>
  )
}

function PeopleTab({ onChanged }: { onChanged: () => void }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<UserFilter>('todos')
  const [open, setOpen] = useState<AdminUser | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api.security!.users().then(setUsers).catch((e) => setError(e?.message ?? String(e)))
  }, [])
  useEffect(load, [load])

  const list = useMemo(() => filterUsers(users ?? [], q, filter), [users, q, filter])
  if (error) return <p className="alert">{error}</p>
  if (!users) return <div className="spinner" />

  const chips: [UserFilter, string][] = [['todos', 'Todas'], ['suspeitos', 'Senhas erradas'], ['bloqueados', 'Bloqueadas'], ['sem-confirmar', 'Sem confirmar'], ['inativos', 'Inativas 30 dias']]
  return (
    <>
      <div className="search"><Icon name="search" size={18} /><input placeholder="Buscar por e-mail ou nome" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar pessoa" /></div>
      <div className="chips-wrap">
        {chips.map(([v, label]) => <button key={v} className={`chip-btn ${filter === v ? 'on' : ''}`} onClick={() => setFilter(v)}>{label}</button>)}
      </div>
      <p className="muted small">{list.length} de {users.length} pessoa(s)</p>
      <div className="card flush admin-list">
        {list.map((u) => (
          <button key={u.id} className="admin-row" onClick={() => setOpen(u)}>
            <span className="admin-avatar" aria-hidden="true">{(u.name || u.email).charAt(0).toUpperCase()}</span>
            <span className="grow admin-who">
              <b>{u.name || u.email.split('@')[0]}</b>
              <span className="muted small">{u.email}</span>
              <span className="admin-tags">
                {u.admin && <span className="chip good">Gestor</span>}
                {u.blocked && <span className="chip bad">Bloqueada</span>}
                {!u.confirmed && <span className="chip warn">Sem confirmar</span>}
                {u.failed24 > 0 && <span className={`chip ${u.failed24 >= 5 ? 'bad' : 'warn'}`}>{u.failed24} senha(s) errada(s) 24 h</span>}
                {u.shares + u.member_of > 0 && <span className="chip">Família</span>}
              </span>
            </span>
            <span className="admin-dates muted small">
              <span>Último acesso: {ago(u.last_sign_in_at)}</span>
              <span>Desde {when(u.created_at).slice(0, 8)}</span>
            </span>
          </button>
        ))}
        {!list.length && <p className="empty">Ninguém encontrado.</p>}
      </div>
      {open && <PersonSheet user={open} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load(); onChanged() }} />}
    </>
  )
}

function PersonSheet({ user: u, onClose, onChanged }: { user: AdminUser; onClose: () => void; onChanged: () => void }) {
  const { toast } = useApp()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [typed, setTyped] = useState('')
  const [events, setEvents] = useState<SecurityEvent[] | null>(null)

  useEffect(() => {
    api.security!.events(null, 30).then((all) => setEvents(all.filter((e) => e.user_id === u.id || e.email === u.email.toLowerCase()).slice(0, 15))).catch(() => setEvents([]))
  }, [u])

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true)
    setError('')
    try {
      await fn()
      toast(ok)
      onChanged()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title={u.name || u.email} onClose={onClose}>
      <ul className="kv">
        <li><span>E-mail</span><b>{u.email}</b></li>
        <li><span>Cadastro</span><span>{when(u.created_at)}</span></li>
        <li><span>Último acesso</span><span>{when(u.last_sign_in_at)} ({ago(u.last_sign_in_at)})</span></li>
        <li><span>E-mail confirmado</span><span>{u.confirmed ? 'Sim' : 'Não'}</span></li>
        <li><span>Situação</span><span>{u.blocked ? '🔒 Bloqueada' : 'Ativa'}{u.admin ? ' · Gestor' : ''}</span></li>
        <li><span>Família</span><span>{u.shares ? `compartilha com ${u.shares}` : ''}{u.shares && u.member_of ? ' · ' : ''}{u.member_of ? `participa de ${u.member_of}` : ''}{!u.shares && !u.member_of ? '—' : ''}</span></li>
        <li><span>ID</span><button className="link small" onClick={() => navigator.clipboard?.writeText(u.id).then(() => toast('ID copiado'))}>{u.id.slice(0, 8)}… copiar</button></li>
      </ul>

      <h3>Atividade recente (30 dias)</h3>
      {!events ? <div className="spinner" /> : events.length ? (
        <ul className="kv">
          {events.map((e) => <li key={e.id}><span>{EVENT_LABEL[e.kind]?.icon} {EVENT_LABEL[e.kind]?.label ?? e.kind}</span><span className="muted small">{when(e.created_at)}{e.ip ? ` · ${e.ip}` : ''}</span></li>)}
        </ul>
      ) : <p className="muted small">Nada registrado.</p>}

      {error && <p className="alert">{error}</p>}
      {!u.admin && (
        <div className="admin-actions">
          {u.blocked
            ? <button className="btn block" disabled={busy} onClick={() => act(() => api.security!.setBlocked(u.id, false), 'Conta desbloqueada')}>🔓 Desbloquear conta</button>
            : <button className="btn block" disabled={busy} onClick={() => confirm(`Bloquear ${u.email}? A pessoa não conseguirá mais entrar e os aparelhos dela saem da conta em até 1 hora. Os dados continuam guardados.`) && act(() => api.security!.setBlocked(u.id, true), 'Conta bloqueada')}>🔒 Bloquear conta</button>}
          {!confirmDelete
            ? <button className="btn danger block" disabled={busy} onClick={() => setConfirmDelete(true)}><Icon name="trash" size={18} /> Excluir conta e dados</button>
            : (
              <div className="card admin-danger">
                <p className="small"><b>Isto não pode ser desfeito.</b> Apaga a conta e todos os lançamentos, metas e reservas dessa pessoa. Use, por exemplo, quando o titular pedir a exclusão (LGPD) ou para contas falsas.</p>
                <Field label={`Para confirmar, digite o e-mail: ${u.email}`}>
                  <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
                </Field>
                <button className="btn danger-fill block" disabled={busy || typed.trim().toLowerCase() !== u.email.toLowerCase()} onClick={() => act(async () => {
                  const r = await api.security!.deleteUser(u.id)
                  if (r.files) alert(`Conta excluída. Ficaram ${r.files} arquivo(s) (foto e comprovantes) no Supabase › Storage, na pasta ${u.id}, nos buckets avatars e receipts. Apague essa pasta por lá.`)
                }, 'Conta excluída')}>Excluir definitivamente</button>
              </div>
            )}
        </div>
      )}
    </Sheet>
  )
}

const KINDS: (SecurityEventKind | '')[] = ['', 'login_failed', 'login_ok', 'reset_requested', 'invite_failed', 'invite_blocked', 'csp_violation', 'flood', 'admin_block', 'admin_unblock', 'admin_delete']

function EventsTab() {
  const [kind, setKind] = useState<SecurityEventKind | ''>('')
  const [days, setDays] = useState(7)
  const [events, setEvents] = useState<SecurityEvent[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setEvents(null)
    api.security!.events(kind || null, days).then(setEvents).catch((e) => setError(e?.message ?? String(e)))
  }, [kind, days])

  const byEmail = useMemo(() => topBy(events ?? [], 'login_failed', 'email'), [events])
  const byIp = useMemo(() => topBy(events ?? [], 'login_failed', 'ip'), [events])

  return (
    <>
      <div className="admin-filters">
        <Field label="Tipo">
          <select value={kind} onChange={(e) => setKind(e.target.value as SecurityEventKind | '')}>
            {KINDS.map((k) => <option key={k} value={k}>{k ? `${EVENT_LABEL[k].icon} ${EVENT_LABEL[k].label}` : 'Todos os tipos'}</option>)}
          </select>
        </Field>
        <Field label="Período">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={1}>Últimas 24 horas</option>
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </select>
        </Field>
      </div>
      {error && <p className="alert">{error}</p>}
      {!events ? <div className="spinner" /> : (
        <>
          {(byEmail.length > 0 || byIp.length > 0) && (
            <div className="admin-top">
              <section className="card">
                <h3>Mais senhas erradas por conta</h3>
                <ul className="kv">{byEmail.map((x) => <li key={x.value}><span>{x.value}</span><b>{x.n}</b></li>)}</ul>
              </section>
              <section className="card">
                <h3>Mais senhas erradas por endereço (IP)</h3>
                <ul className="kv">{byIp.map((x) => <li key={x.value}><span>{x.value}</span><b>{x.n}</b></li>)}</ul>
              </section>
            </div>
          )}
          <p className="muted small">{events.length === 500 ? 'Mostrando os 500 mais recentes' : `${events.length} registro(s)`} · guardados por 90 dias</p>
          <div className="card flush admin-list">
            {events.map((e) => {
              const l = EVENT_LABEL[e.kind] ?? { icon: '•', label: e.kind, tone: '' }
              return (
                <div key={e.id} className="admin-event">
                  <span className="admin-event-icon" aria-hidden="true">{l.icon}</span>
                  <span className="grow admin-who">
                    <b className={l.tone === 'bad' ? 'neg' : ''}>{l.label}</b>
                    <span className="small">{e.email ?? <span className="muted">sem e-mail</span>}{e.detail ? <span className="muted"> · {e.detail}</span> : null}</span>
                    <span className="muted small">{[e.ip && `IP ${e.ip}`, device(e.user_agent)].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="muted small admin-time">{when(e.created_at)}</span>
                </div>
              )
            })}
            {!events.length && <p className="empty">Nada registrado no período. 🎉</p>}
          </div>
          <p className="muted small">"Senha errada" é registrada pelo próprio app. Ataques feitos direto no Supabase, sem passar pelo app, aparecem no painel do Supabase em Logs › Auth.</p>
        </>
      )}
    </>
  )
}

function AlertsTab({ onChanged }: { onChanged: () => void }) {
  const [all, setAll] = useState(false)
  const [alerts, setAlerts] = useState<SecurityAlert[] | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(() => {
    api.security!.alerts(all).then(setAlerts).catch((e) => setError(e?.message ?? String(e)))
  }, [all])
  useEffect(load, [load])

  async function resolve(id: number | 'all') {
    try {
      await api.security!.resolveAlert(id)
      load()
      onChanged()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    }
  }

  const open = alerts?.filter((a) => !a.resolved_at) ?? []
  return (
    <>
      <div className="btn-row">
        <button className={`chip-btn ${all ? '' : 'on'}`} onClick={() => setAll(false)}>Abertos</button>
        <button className={`chip-btn ${all ? 'on' : ''}`} onClick={() => setAll(true)}>Todos (90 dias)</button>
        {open.length > 1 && <button className="btn ghost small" onClick={() => resolve('all')}>Marcar todos como vistos</button>}
      </div>
      {error && <p className="alert">{error}</p>}
      {!alerts ? <div className="spinner" /> : (
        <div className="admin-alerts">
          {alerts.map((a) => (
            <section key={a.id} className={`card admin-alert ${a.level} ${a.resolved_at ? 'done' : ''}`}>
              <div className="admin-alert-head">
                <span className={`chip ${a.level === 'critical' ? 'bad' : a.level === 'warn' ? 'warn' : ''}`}>{a.level === 'critical' ? 'Grave' : a.level === 'warn' ? 'Atenção' : 'Aviso'}</span>
                <span className="muted small">{when(a.created_at)}</span>
              </div>
              <h3>{a.title}</h3>
              {a.detail && <p className="small">{a.detail}</p>}
              {a.resolved_at
                ? <p className="muted small">✓ Visto em {when(a.resolved_at)}</p>
                : <button className="btn ghost small" onClick={() => resolve(a.id)}><Icon name="check" size={16} /> Marcar como visto</button>}
            </section>
          ))}
          {!alerts.length && <p className="empty">Nenhum alerta {all ? 'nos últimos 90 dias' : 'aberto'}. Tudo tranquilo. 🛡️</p>}
        </div>
      )}
      <section className="card">
        <h3>O que gera alerta</h3>
        <ul className="small admin-rules">
          <li>10 senhas erradas para a mesma conta em 1 hora.</li>
          <li>Um mesmo endereço (IP) errando a senha de 5 contas em 1 hora.</li>
          <li>Alguém errando o código de convite da família 10 vezes (fica bloqueado 1 hora).</li>
          <li>Código estranho bloqueado pela proteção do site.</li>
          <li>Mais de 2.000 tentativas em 10 minutos (possível ataque automatizado).</li>
        </ul>
        <p className="muted small">Alertas novos também chegam por e-mail, pela verificação diária do GitHub (se estiver configurada).</p>
      </section>
    </>
  )
}
