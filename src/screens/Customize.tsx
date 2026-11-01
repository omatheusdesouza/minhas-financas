import { Link, useSearchParams } from 'react-router-dom'
import { Segmented } from '../components/Fields'
import { Icon } from '../components/Icon'
import {
  DEFAULT_TABS, homeLayout, menuLayout, move, NAV, tabLayout, TAB_SLOTS,
  type NavId, type UiPrefs, type WidgetId,
} from '../lib/prefs'
import { useApp } from '../store'

type Tab = 'inicio' | 'navegacao'

/** Ajustes › Personalizar: blocos do Início e atalhos da navegação (valem em todos os aparelhos da conta). */
export function CustomizeScreen() {
  const { prefs, setPrefs, toast } = useApp()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('aba') === 'navegacao' ? 'navegacao' : 'inicio'

  return (
    <div className="screen narrow customize">
      <header className="top">
        <Link to="/ajustes" className="icon-btn" aria-label="Voltar"><Icon name="left" /></Link>
        <h1>Personalizar</h1>
        <span />
      </header>
      <p className="muted small">Escolha o que aparece no Início e quais telas ficam à mão. As mudanças valem na hora e em todos os seus aparelhos.</p>
      <Segmented value={tab} onChange={(v) => setParams(v === 'inicio' ? {} : { aba: v }, { replace: true })} options={[
        { value: 'inicio', label: 'Início' },
        { value: 'navegacao', label: 'Navegação' },
      ]} />
      {tab === 'inicio'
        ? <HomeBlocks prefs={prefs} save={(p) => setPrefs(p)} reset={() => { setPrefs({ ...prefs, home: undefined }); toast('Início no padrão') }} />
        : <Navigation prefs={prefs} save={(p) => setPrefs(p)} reset={() => { setPrefs({ ...prefs, tabs: undefined, menu: undefined }); toast('Navegação no padrão') }} />}
    </div>
  )
}

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className="toggle switch-only">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="toggle-track"><span className="toggle-thumb" /></span>
    </label>
  )
}

function MoveButtons({ label, first, last, onMove }: { label: string; first: boolean; last: boolean; onMove: (d: -1 | 1) => void }) {
  return (
    <span className="move-btns">
      <button type="button" className="icon-btn sm" disabled={first} onClick={() => onMove(-1)} aria-label={`Subir ${label}`}><Icon name="up" size={18} /></button>
      <button type="button" className="icon-btn sm" disabled={last} onClick={() => onMove(1)} aria-label={`Descer ${label}`}><Icon name="down" size={18} /></button>
    </span>
  )
}

function HomeBlocks({ prefs, save, reset }: { prefs: UiPrefs; save: (p: UiPrefs) => void; reset: () => void }) {
  const items = homeLayout(prefs)
  const order = items.map((w) => w.id)
  const hidden = items.filter((w) => !w.visible).map((w) => w.id)
  const set = (o: WidgetId[], h: WidgetId[]) => save({ ...prefs, home: { order: o, hidden: h } })
  const shown = items.length - hidden.length

  return (
    <>
      <section className="card flush custom-list" aria-label="Blocos do Início">
        {items.map((w, i) => (
          <div key={w.id} className={`custom-row ${w.visible ? '' : 'off'}`}>
            <span className="custom-icon" aria-hidden="true">{w.icon}</span>
            <span className="grow custom-text">
              <b>{w.label}</b>
              <span className="muted small">{w.desc}</span>
            </span>
            <MoveButtons label={w.label} first={i === 0} last={i === items.length - 1} onMove={(d) => set(move(order, w.id, d), hidden)} />
            <Switch
              checked={w.visible} label={`Mostrar ${w.label}`}
              onChange={(v) => set(order, v ? hidden.filter((x) => x !== w.id) : [...hidden, w.id])}
            />
          </div>
        ))}
      </section>
      <p className="muted small">
        {shown} de {items.length} blocos no Início. No computador, os blocos ficam em duas colunas (resumo à esquerda, gráficos e metas à direita), cada coluna na ordem escolhida.
      </p>
      <div className="btn-row">
        <Link to="/" className="btn primary"><Icon name="home" size={18} /> Ver o Início</Link>
        <button className="btn ghost" onClick={reset}>Restaurar padrão</button>
      </div>
    </>
  )
}

function Navigation({ prefs, save, reset }: { prefs: UiPrefs; save: (p: UiPrefs) => void; reset: () => void }) {
  const tabs = tabLayout(prefs)
  const chosen = tabs.slice(1).map((t) => t.id)
  const menu = menuLayout(prefs)
  const order = menu.map((n) => n.id)
  const hidden = menu.filter((n) => !n.visible).map((n) => n.id)
  const setMenu = (o: NavId[], h: NavId[]) => save({ ...prefs, menu: { order: o, hidden: h } })
  const setSlot = (slot: number, id: NavId) => {
    const next = [...chosen]
    const other = next.indexOf(id)
    if (other >= 0) next[other] = next[slot] // troca de lugar com o que já estava escolhido
    next[slot] = id
    save({ ...prefs, tabs: next })
  }

  return (
    <>
      <section className="card">
        <div className="card-title"><h3>📱 Barra de baixo (celular)</h3></div>
        <p className="muted small">O Início fica sempre no primeiro lugar. Escolha os outros {TAB_SLOTS} atalhos; o botão <b>+</b> fica no meio.</p>
        <div className="tab-preview" aria-hidden="true">
          {tabs.map((t, i) => (
            <span key={t.id} className="tab-preview-item">
              {i === 2 && <span className="tab-preview-fab"><Icon name="plus" size={18} /></span>}
              <span className="tab-preview-link"><Icon name={t.icon} size={18} /><span>{t.short}</span></span>
            </span>
          ))}
        </div>
        <div className="slot-grid">
          {chosen.map((id, slot) => (
            <label key={slot} className="field">
              <span className="field-label">Atalho {slot + 2}</span>
              <select value={id} onChange={(e) => setSlot(slot, e.target.value as NavId)}>
                {NAV.filter((n) => n.id !== 'inicio').map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
            </label>
          ))}
        </div>
        {chosen.join() !== DEFAULT_TABS.join() && (
          <button className="link small" onClick={() => save({ ...prefs, tabs: undefined })}>Voltar a barra para o padrão</button>
        )}
      </section>

      <section className="card flush custom-list" aria-label="Menu lateral">
        <div className="custom-head">
          <h3>🖥️ Menu lateral (computador)</h3>
          <p className="muted small">Ligue as telas que quer no menu e coloque na ordem. As teclas 1 a 9 abrem os itens nessa ordem.</p>
        </div>
        {menu.map((n, i) => {
          const key = menu.filter((x) => x.visible).indexOf(n) + 1
          return (
            <div key={n.id} className={`custom-row ${n.visible ? '' : 'off'}`}>
              <span className="custom-icon nav-icon" aria-hidden="true"><Icon name={n.icon} size={18} /></span>
              <span className="grow custom-text">
                <b>{n.label}</b>
                <span className="muted small">{n.locked ? 'Sempre no menu' : n.visible && key <= 9 ? `Tecla ${key}` : n.visible ? 'Sem tecla de atalho' : 'Escondido'}</span>
              </span>
              <MoveButtons label={n.label} first={i === 0} last={i === menu.length - 1} onMove={(d) => setMenu(move(order, n.id, d), hidden)} />
              <Switch
                checked={n.visible} disabled={n.locked} label={`Mostrar ${n.label} no menu`}
                onChange={(v) => setMenu(order, v ? hidden.filter((x) => x !== n.id) : [...hidden, n.id])}
              />
            </div>
          )
        })}
      </section>
      <div className="btn-row">
        <button className="btn ghost" onClick={reset}>Restaurar padrão</button>
      </div>
    </>
  )
}
