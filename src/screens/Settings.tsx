import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CATEGORY_COLORS, CATEGORY_ICONS, LEGACY_COLOR_MAP } from '../lib/defaults'
import { MyAvatar } from '../components/Avatar'
import { Field, MoneyInput, Segmented, Toggle } from '../components/Fields'
import { ProfileForm, draftFrom, nameError, saveProfileDraft } from '../components/ProfileForm'
import { ReminderSettings } from '../components/Reminders'
import { SecuritySettings } from '../components/SecuritySettings'
import { SyncSettings } from '../components/SyncBadge'
import { useLock } from '../lockContext'
import { Icon } from '../components/Icon'
import { Sheet } from '../components/Sheet'
import { api } from '../lib/api'
import { saveFile } from '../lib/exporter'
import { moneyInput, parseMoney, money } from '../lib/format'
import { getTheme, setTheme, type ThemeChoice } from '../lib/theme'
import type { Category, Kind, Nature, PaymentMethod } from '../lib/types'
import { useApp } from '../store'

export function Settings() {
  const { user, run, profile, sync } = useApp()
  const lock = useLock()
  const [pwOpen, setPwOpen] = useState(false)
  const [theme, setThemeState] = useState<ThemeChoice>(getTheme())

  async function backup() {
    await run(async () => {
      const [categories, payment_methods, transactions, installment_plans, recurring_bills] = await Promise.all([
        api.listCategories(), api.listPaymentMethods(), api.listTransactions('1900-01-01', '2999-12-31'),
        api.listPlans(), api.listRecurring(),
      ])
      const data = { exported_at: new Date().toISOString(), categories, payment_methods, transactions, installment_plans, recurring_bills }
      await saveFile(`backup_fynvault_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json')
    })
  }

  return (
    <div className="screen">
      <header className="top"><BackLink /><h1>Ajustes</h1><span /></header>

      <div className="settings-grid">
        <Link to="/ajustes/perfil" className="card account-card">
          <div className="account">
            <MyAvatar size={56} />
            <div className="grow">
              <strong className="account-name">{profile?.display_name}</strong>
              <p className="muted small">{user.email}</p>
              <p className="muted small">
                {api.mode === 'cloud' ? '☁️ Dados salvos na nuvem com segurança' : '📱 Modo demonstração — dados só neste aparelho'}
              </p>
            </div>
            <Icon name="right" className="muted" />
          </div>
        </Link>

        <section className="card">
          <div className="card-title"><h3>Aparência</h3></div>
          <Segmented value={theme} onChange={(v) => { setThemeState(v); setTheme(v) }} options={[
            { value: 'auto', label: 'Automático' }, { value: 'light', label: 'Claro' }, { value: 'dark', label: 'Escuro' },
          ]} />
          <p className="muted small">No automático, o Fynvault segue o tema do celular.</p>
        </section>

        <SyncSettings />

        <ReminderSettings />

        <SecuritySettings />

        <nav className="card flush menu">
          <Link to="/metas"><span className="menu-emoji">🎯</span> Metas de economia <Icon name="right" className="end" /></Link>
          <Link to="/ajustes/familia"><span className="menu-emoji">👨‍👩‍👧</span> Família (compartilhar) <Icon name="right" className="end" /></Link>
          <Link to="/ajustes/categorias"><Icon name="tag" /> Categorias e limites de gasto <Icon name="right" className="end" /></Link>
          <Link to="/ajustes/pagamentos"><Icon name="card" /> Formas de pagamento <Icon name="right" className="end" /></Link>
          <button onClick={backup}><Icon name="download" /> Fazer backup (arquivo JSON) <Icon name="right" className="end" /></button>
          {api.mode === 'cloud' && <button onClick={() => setPwOpen(true)}><Icon name="user" /> Trocar senha <Icon name="right" className="end" /></button>}
          <button className="danger-text" onClick={async () => {
            const pending = sync?.pending ?? 0
            const msg = pending
              ? `Atenção: ${pending} alteração(ões) ainda não foram enviadas para a nuvem e serão perdidas se você sair agora. Conecte-se à internet e toque em "Sincronizar agora" antes. Sair mesmo assim?`
              : 'Sair da sua conta? Os dados ficam salvos na nuvem; a cópia deste celular e o bloqueio por PIN são removidos.'
            if (!confirm(msg)) return
            await lock.clear()
            await api.signOut()
          }}><Icon name="logout" /> Sair</button>
        </nav>

      </div>

      <p className="muted small center">Fynvault · Personal finance · versão 1.1</p>
      {pwOpen && <PasswordSheet onClose={() => setPwOpen(false)} />}
    </div>
  )
}

function BackLink() {
  return <Link to="/" className="icon-btn back-home" aria-label="Voltar"><Icon name="left" /></Link>
}

function PasswordSheet({ onClose }: { onClose: () => void }) {
  const { run } = useApp()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const valid = pw.length >= 6 && pw === pw2
  return (
    <Sheet title="Trocar senha" onClose={onClose} footer={
      <button className="btn primary grow" disabled={!valid} onClick={async () => {
        if (await run(() => api.updatePassword(pw).then(() => true), 'Senha alterada')) onClose()
      }}>Salvar</button>
    }>
      <Field label="Nova senha" hint="Mínimo de 6 caracteres"><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
      <Field label="Repita a nova senha"><input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></Field>
      {pw2 && pw !== pw2 && <p className="bad-text small">As senhas não conferem.</p>}
    </Sheet>
  )
}

export function CategoriesScreen() {
  const { idx, run, reloadMeta, canEdit, space } = useApp()
  const [kind, setKind] = useState<Kind>('expense')
  const [editing, setEditing] = useState<Partial<Category> | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const roots = idx.roots(kind, true).filter((c) => showArchived || !c.archived)
  const legacy = idx.all.filter((c) => LEGACY_COLOR_MAP[c.color.toLowerCase()])

  async function applyPalette() {
    if (!confirm(`Trocar as cores de ${legacy.length} categoria(s) pelos tons da paleta Fynvault? Categorias em que você escolheu outra cor não mudam.`)) return
    await run(async () => {
      for (const c of legacy) await api.saveCategory({ ...c, color: LEGACY_COLOR_MAP[c.color.toLowerCase()] })
      await reloadMeta()
    }, 'Cores atualizadas')
  }

  async function move(c: Category, dir: -1 | 1) {
    const siblings = (c.parent_id ? idx.children(c.parent_id, true) : idx.roots(kind, true))
    const i = siblings.findIndex((x) => x.id === c.id)
    const j = i + dir
    if (j < 0 || j >= siblings.length) return
    const reordered = [...siblings]
    ;[reordered[i], reordered[j]] = [reordered[j], reordered[i]]
    await run(async () => {
      for (const [k, s] of reordered.entries()) if (s.sort_order !== k) await api.saveCategory({ ...s, sort_order: k })
      await reloadMeta()
    })
  }

  const row = (c: Category, child = false) => (
    <div key={c.id} className={`cat-row ${child ? 'child' : ''} ${c.archived ? 'dim' : ''}`}>
      <button className="cat-main" disabled={!canEdit} onClick={() => setEditing(c)}>
        <span className="tx-icon" style={{ background: `${(idx.root(c.id)?.color ?? c.color)}22` }}>{c.icon}</span>
        <span className="tx-text">
          <span className="tx-desc">{c.name}</span>
          <span className="tx-meta">
            {c.nature === 'superfluo' ? 'Supérfluo' : c.nature === 'investimento' ? 'Investimento' : 'Essencial'}
            {c.monthly_budget ? ` · limite ${money(c.monthly_budget)}/mês` : ''}
            {c.archived ? ' · arquivada' : ''}
          </span>
        </span>
      </button>
      <button className="icon-btn sm" aria-label="Subir" onClick={() => move(c, -1)}><Icon name="up" size={16} /></button>
      <button className="icon-btn sm" aria-label="Descer" onClick={() => move(c, 1)}><Icon name="down" size={16} /></button>
    </div>
  )

  return (
    <div className="screen narrow">
      <header className="top"><Link to="/ajustes" className="icon-btn" aria-label="Voltar"><Icon name="left" /></Link><h1>Categorias</h1><span /></header>
      <Segmented value={kind} onChange={setKind} options={[{ value: 'expense', label: 'Gastos' }, { value: 'income', label: 'Ganhos' }]} />
      {space.role && <p className="note small">Categorias das finanças de {space.name}.</p>}
      {canEdit && <button className="btn primary block" onClick={() => setEditing({ kind, parent_id: null })}><Icon name="plus" /> Nova categoria</button>}
      <p className="muted small">Toque para editar nome, ícone, cor, tipo e limite mensal. Use as setas para reordenar.</p>
      {legacy.length > 0 && (
        <div className="note palette-note">
          <span>✨ Suas categorias ainda usam as cores antigas. Quer usar os tons da paleta Fynvault?</span>
          <button className="btn ghost" onClick={applyPalette}>Aplicar cores Fynvault</button>
        </div>
      )}
      {roots.map((r) => (
        <section key={r.id} className="card flush">
          {row(r)}
          {idx.children(r.id, true).filter((c) => showArchived || !c.archived).map((c) => row(c, true))}
          {canEdit && <button className="add-sub" onClick={() => setEditing({ kind, parent_id: r.id, color: r.color, nature: r.nature })}>
            <Icon name="plus" size={16} /> Subcategoria em {r.name}
          </button>}
        </section>
      ))}
      <Toggle checked={showArchived} onChange={setShowArchived} label="Mostrar arquivadas" />
      {editing && <CategoryEditor cat={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function CategoryEditor({ cat, onClose }: { cat: Partial<Category>; onClose: () => void }) {
  const { idx, run, reloadMeta } = useApp()
  const kind = cat.kind ?? 'expense'
  const [name, setName] = useState(cat.name ?? '')
  const [icon, setIcon] = useState(cat.icon ?? '🏷️')
  const [color, setColor] = useState(cat.color ?? CATEGORY_COLORS[0])
  const [nature, setNature] = useState<Nature>(cat.nature ?? 'essencial')
  const [parentId, setParentId] = useState<string | null>(cat.parent_id ?? null)
  const [budget, setBudget] = useState(moneyInput(cat.monthly_budget))
  const [archived, setArchived] = useState(cat.archived ?? false)
  const hasChildren = cat.id ? idx.children(cat.id, true).length > 0 : false
  const parents = idx.roots(kind, true).filter((r) => r.id !== cat.id)

  async function save() {
    if (!name.trim()) return
    const b = budget ? parseMoney(budget) : null
    const ok = await run(async () => {
      await api.saveCategory({
        ...(cat as Category), kind, name: name.trim(), icon, color, nature, parent_id: parentId,
        monthly_budget: b && b > 0 ? b : null, archived,
        sort_order: cat.sort_order ?? (parentId ? idx.children(parentId, true).length : idx.roots(kind, true).length),
      })
      await reloadMeta()
      return true
    }, cat.id ? 'Categoria atualizada' : 'Categoria criada')
    if (ok) onClose()
  }

  async function remove() {
    if (!cat.id) return
    const msg = hasChildren
      ? `Excluir "${cat.name}" e todas as subcategorias? Os lançamentos ficarão "Sem categoria". Dica: você pode arquivar em vez de excluir.`
      : `Excluir "${cat.name}"? Os lançamentos dela ficarão "Sem categoria".`
    if (!confirm(msg)) return
    const ok = await run(async () => { await api.deleteCategory(cat.id!); await reloadMeta(); return true }, 'Categoria excluída')
    if (ok) onClose()
  }

  return (
    <Sheet
      title={cat.id ? 'Editar categoria' : parentId ? 'Nova subcategoria' : 'Nova categoria'} onClose={onClose}
      footer={<>
        {cat.id && <button className="btn danger ghost" onClick={remove}>Excluir</button>}
        <button className="btn primary grow" disabled={!name.trim()} onClick={save}>Salvar</button>
      </>}
    >
      <div className="cat-preview">
        <span className="tx-icon lg" style={{ background: `${color}22` }}>{icon}</span>
        <input className="grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da categoria" maxLength={60} autoFocus={!cat.id} />
      </div>
      <Field label="Ícone">
        <div className="icon-grid">
          {CATEGORY_ICONS.map((i) => (
            <button key={i} type="button" className={i === icon ? 'on' : ''} onClick={() => setIcon(i)}>{i}</button>
          ))}
        </div>
      </Field>
      {!parentId && (
        <Field label="Cor">
          <div className="color-grid">
            {CATEGORY_COLORS.map((c) => (
              <button key={c} type="button" aria-label={c} className={c === color ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
        </Field>
      )}
      {!hasChildren && (
        <Field label="Fica dentro de">
          <select value={parentId ?? ''} onChange={(e) => setParentId(e.target.value || null)}>
            <option value="">— É uma categoria principal —</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
          </select>
        </Field>
      )}
      {kind === 'expense' && (
        <>
          <Field label="Tipo de gasto" hint="Usado no índice de saúde financeira">
            <Segmented value={nature} onChange={setNature} options={[
              { value: 'essencial', label: 'Essencial' }, { value: 'superfluo', label: 'Supérfluo' }, { value: 'investimento', label: 'Investimento' },
            ]} />
          </Field>
          <Field label="Limite de gasto por mês" hint="Opcional. Avisamos quando passar.">
            <MoneyInput value={budget} onChange={setBudget} />
          </Field>
        </>
      )}
      <Toggle checked={archived} onChange={setArchived} label="Arquivada (some das opções, mas mantém o histórico)" />
    </Sheet>
  )
}

export function PaymentMethodsScreen() {
  const { paymentMethods, run, reloadMeta, canEdit } = useApp()
  const [editing, setEditing] = useState<Partial<PaymentMethod> | null>(null)
  const [name, setName] = useState('')

  async function save() {
    if (!editing || !name.trim()) return
    const ok = await run(async () => {
      await api.savePaymentMethod({ ...(editing as PaymentMethod), name: name.trim(), archived: editing.archived ?? false })
      await reloadMeta()
      return true
    }, 'Forma de pagamento salva')
    if (ok) setEditing(null)
  }

  return (
    <div className="screen narrow">
      <header className="top"><Link to="/ajustes" className="icon-btn" aria-label="Voltar"><Icon name="left" /></Link><h1>Formas de pagamento</h1><span /></header>
      {canEdit && <button className="btn primary block" onClick={() => { setEditing({}); setName('') }}><Icon name="plus" /> Nova forma de pagamento</button>}
      <p className="muted small">Ex.: Cartão Nubank, Cartão Itaú, Pix, Dinheiro, Promissória da loja X…</p>
      <div className="card flush">
        {paymentMethods.map((m) => (
          <button key={m.id} className={`tx-main list-btn ${m.archived ? 'dim' : ''}`} disabled={!canEdit} onClick={() => { setEditing(m); setName(m.name) }}>
            <span className="tx-icon"><Icon name="card" /></span>
            <span className="tx-text"><span className="tx-desc">{m.name}</span>{m.archived && <span className="tx-meta">arquivada</span>}</span>
            <Icon name="edit" size={16} />
          </button>
        ))}
      </div>
      {editing && (
        <Sheet title={editing.id ? 'Editar forma de pagamento' : 'Nova forma de pagamento'} onClose={() => setEditing(null)} footer={<>
          {editing.id && <button className="btn danger ghost" onClick={async () => {
            if (!confirm(`Excluir "${editing.name}"?`)) return
            if (await run(async () => { await api.deletePaymentMethod(editing.id!); await reloadMeta(); return true }, 'Excluída')) setEditing(null)
          }}>Excluir</button>}
          <button className="btn primary grow" disabled={!name.trim()} onClick={save}>Salvar</button>
        </>}>
          <Field label="Nome"><input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={40} /></Field>
          {editing.id && <Toggle checked={editing.archived ?? false} onChange={(v) => setEditing({ ...editing, archived: v })} label="Arquivada" />}
        </Sheet>
      )}
    </div>
  )
}

export function ProfileScreen() {
  const { profile, avatarUrl, run, reloadProfile } = useApp()
  const nav = useNavigate()
  const [draft, setDraft] = useState(() => draftFrom(profile, avatarUrl))
  const [showErrors, setShowErrors] = useState(false)

  async function save() {
    setShowErrors(true)
    if (nameError(draft.display_name)) return
    const ok = await run(async () => {
      await saveProfileDraft(draft, profile)
      await reloadProfile()
      return true
    }, 'Perfil atualizado')
    if (ok) nav('/ajustes')
  }

  function cancel() {
    // foto enviada e não salva: apaga do armazenamento
    if (draft.avatar_path && draft.avatar_path !== profile?.avatar_path) api.removeFile('avatars', draft.avatar_path).catch(() => {})
    nav('/ajustes')
  }

  return (
    <div className="screen narrow">
      <header className="top"><button className="icon-btn" aria-label="Voltar" onClick={cancel}><Icon name="left" /></button><h1>Meu perfil</h1><span /></header>
      <section className="card"><ProfileForm value={draft} onChange={setDraft} showErrors={showErrors} /></section>
      <button className="btn primary block" onClick={save}>Salvar</button>
    </div>
  )
}
