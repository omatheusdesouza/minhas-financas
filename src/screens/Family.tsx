import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Field, Segmented } from '../components/Fields'
import { Icon } from '../components/Icon'
import { Sheet } from '../components/Sheet'
import { api } from '../lib/api'
import { fmt } from '../lib/dates'
import { shareText } from '../lib/exporter'
import type { FamilyInvite, FamilyMember, FamilyRole } from '../lib/types'
import { useApp } from '../store'

const ROLE_OPTIONS: { value: FamilyRole; label: string }[] = [
  { value: 'editor', label: 'Pode editar' },
  { value: 'viewer', label: 'Só visualizar' },
]
const roleLabel = (r: FamilyRole) => (r === 'editor' ? 'pode editar' : 'só visualiza')

export function FamilyScreen() {
  const fam = api.family
  const { spaces, setSpace, reloadSpaces, run, toast } = useApp()
  const nav = useNavigate()
  const [data, setData] = useState<{ members: FamilyMember[]; invites: FamilyInvite[] } | null>(null)
  const [inviting, setInviting] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!fam?.available()) return
    try {
      setData(await fam.members())
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }, [fam, toast])
  useEffect(() => { load() }, [load])

  const back = <Link to="/ajustes" className="icon-btn" aria-label="Voltar"><Icon name="left" /></Link>

  if (!fam || !fam.available()) {
    return (
      <div className="screen narrow">
        <header className="top">{back}<h1>Família</h1><span /></header>
        <p className="note">
          {!fam
            ? 'O modo família funciona com a conta na nuvem (Supabase).'
            : 'Para usar o modo família, aplique a migration 0004 no SQL Editor do Supabase e abra o app de novo.'}
        </p>
      </div>
    )
  }

  async function join() {
    if (!/^[A-Za-z0-9]{6}$/.test(code.trim())) return toast('O código tem 6 letras e números.', 'error')
    setBusy(true)
    const space = await run(() => fam!.accept(code), 'Pronto! As finanças compartilhadas já estão no seu app.')
    setBusy(false)
    if (space) {
      setCode('')
      await reloadSpaces()
      setSpace(space.ownerId)
      nav('/')
    }
  }

  const shared = spaces.filter((s) => s.role)

  return (
    <div className="screen narrow">
      <header className="top">{back}<h1>Família</h1><span /></header>
      <p className="muted small">
        Compartilhe suas finanças com quem mora com você. A pessoa vê suas contas no app dela, como um espaço separado,
        e você escolhe se ela pode editar ou só visualizar. Os dados pessoais dela continuam só dela.
      </p>

      <section className="card">
        <div className="card-title"><h3>Quem tem acesso às minhas finanças</h3></div>
        {!data ? <div className="skeleton" style={{ height: 60 }} /> : data.members.length === 0 ? (
          <p className="muted small">Ninguém ainda.</p>
        ) : data.members.map((m) => (
          <div key={m.memberId} className="family-row">
            <Avatar size={40} emoji={m.avatarEmoji} name={m.name} />
            <div className="grow"><b>{m.name}</b><p className="muted small">{roleLabel(m.role)}</p></div>
            <select aria-label={`Permissão de ${m.name}`} value={m.role} onChange={(e) =>
              run(() => fam.setRole(m.memberId, e.target.value as FamilyRole).then(load), 'Permissão alterada')}>
              {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button className="icon-btn sm" aria-label={`Remover ${m.name}`} onClick={() =>
              confirm(`Remover ${m.name}? A pessoa deixa de ver suas finanças na hora.`)
              && run(() => fam.remove(m.memberId).then(load), 'Acesso removido')}>
              <Icon name="trash" size={18} />
            </button>
          </div>
        ))}
        {data?.invites.map((i) => (
          <div key={i.code} className="family-row invite">
            <span className="invite-code">{i.code}</span>
            <div className="grow"><b>Convite pendente</b><p className="muted small">{roleLabel(i.role)} · vale até {fmt.day(i.expiresAt.slice(0, 10))}</p></div>
            <button className="link danger-text" onClick={() => run(() => fam.cancelInvite(i.code).then(load), 'Convite cancelado')}>Cancelar</button>
          </div>
        ))}
        <button className="btn primary block" onClick={() => setInviting(true)}><Icon name="plus" /> Convidar pessoa</button>
      </section>

      <section className="card">
        <div className="card-title"><h3>Finanças compartilhadas comigo</h3></div>
        {shared.length === 0 ? <p className="muted small">Nenhuma ainda. Se alguém te mandou um código, digite abaixo.</p> : shared.map((s) => (
          <div key={s.ownerId} className="family-row">
            <Avatar size={40} emoji={s.avatarEmoji} name={s.name} />
            <div className="grow"><b>Finanças de {s.name}</b><p className="muted small">Você {roleLabel(s.role!)}</p></div>
            <button className="btn ghost sm-btn gold-btn" onClick={() => { setSpace(s.ownerId); nav('/') }}>Abrir</button>
            <button className="link danger-text" onClick={() =>
              confirm(`Sair das finanças de ${s.name}? Elas somem do seu app.`)
              && run(() => fam.leave(s.ownerId).then(reloadSpaces), 'Você saiu')}>Sair</button>
          </div>
        ))}
        <Field label="Entrar com um código">
          <div className="join-row">
            <input value={code} maxLength={6} placeholder="Ex.: K7M2QX" autoCapitalize="characters" autoComplete="off"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
            <button className="btn primary" disabled={busy || code.length !== 6} onClick={join}>{busy ? 'Entrando…' : 'Entrar'}</button>
          </div>
        </Field>
      </section>

      {inviting && <InviteSheet onClose={() => { setInviting(false); load() }} />}
    </div>
  )
}

function InviteSheet({ onClose }: { onClose: () => void }) {
  const { run, toast, profile } = useApp()
  const [role, setRole] = useState<FamilyRole>('editor')
  const [invite, setInvite] = useState<FamilyInvite | null>(null)

  async function create() {
    const i = await run(() => api.family!.invite(role))
    if (i) setInvite(i)
  }

  async function share() {
    if (!invite) return
    const text = `${profile?.display_name ?? 'Eu'} te convidou para acompanhar as finanças no Fynvault.\n\n`
      + `1. Instale o Fynvault e crie sua conta.\n2. Vá em Ajustes › Família › Entrar com um código.\n3. Digite: ${invite.code}\n\n`
      + `O código vale por 7 dias e pode ser usado uma vez.`
    try { await shareText('Convite Fynvault', text) } catch (e: any) { toast(e.message) }
  }

  return (
    <Sheet title="Convidar pessoa" onClose={onClose}>
      {!invite ? (
        <>
          <Field label="O que a pessoa poderá fazer nas suas finanças?">
            <Segmented value={role} onChange={setRole} options={ROLE_OPTIONS} />
          </Field>
          <p className="note small">
            {role === 'editor'
              ? 'Pode lançar gastos, pagar contas, informar valores e editar. Ideal para quem divide as contas da casa com você.'
              : 'Vê tudo (saldo, contas, relatórios), mas não altera nada.'}
          </p>
          <button className="btn primary block" onClick={create}>Gerar código de convite</button>
        </>
      ) : (
        <>
          <p className="center muted small">Envie este código para a pessoa:</p>
          <p className="invite-big">{invite.code}</p>
          <p className="center muted small">Vale até {fmt.day(invite.expiresAt.slice(0, 10))} · {roleLabel(invite.role)} · uso único</p>
          <button className="btn primary block" onClick={share}><Icon name="share" size={18} /> Enviar convite (WhatsApp, e-mail…)</button>
          <p className="muted small center">Ela entra em Ajustes › Família › Entrar com um código.</p>
        </>
      )}
    </Sheet>
  )
}
