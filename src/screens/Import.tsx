import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CategorySelect, Field, PaymentSelect } from '../components/Fields'
import { Icon } from '../components/Icon'
import { useBudgetWatch } from '../components/useBudgetWatch'
import { api } from '../lib/api'
import { invoiceFor, isCard } from '../lib/cards'
import { addDays, fmt, today } from '../lib/dates'
import { money } from '../lib/format'
import { PdfPasswordError, readStatementFile } from '../lib/importFile'
import { buildPreview, learnCategories, rowKeys, type ImportItem, type Statement } from '../lib/importer'
import { stableId } from '../lib/localData'
import { markPaid } from '../lib/services'
import type { Transaction } from '../lib/types'
import { useApp } from '../store'

/** Lançamentos › Importar extrato: OFX ou CSV do banco, com prévia antes de salvar. */
export function ImportScreen() {
  const { idx, paymentMethods, run, toast, canEdit, bump } = useApp()
  const watchBudget = useBudgetWatch()
  const nav = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [statement, setStatement] = useState<Statement | null>(null)
  const [paymentId, setPaymentId] = useState<string | null>(null)
  const [items, setItems] = useState<ImportItem[] | null>(null)
  const [existing, setExisting] = useState<Transaction[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  // PDF com senha: guarda o arquivo até a pessoa digitar a senha
  const [locked, setLocked] = useState<{ file: File; wrong: boolean } | null>(null)
  const [password, setPassword] = useState('')
  const [dragging, setDragging] = useState(false)

  const pm = paymentMethods.find((m) => m.id === paymentId)
  const card = isCard(pm) ? pm : null

  async function prepare(st: Statement, pmId: string | null) {
    setBusy('Lendo o extrato…')
    try {
      const pmCard = isCard(paymentMethods.find((m) => m.id === pmId))
      const ids = await Promise.all(rowKeys(st.rows, pmId ?? 'sem-forma').map(stableId))
      const dates = st.rows.map((r) => r.date).sort()
      // no cartão o lançamento fica no vencimento da fatura: busca até ~2 meses depois
      const [near, history] = await Promise.all([
        api.listTransactions(addDays(dates[0], -10), addDays(dates[dates.length - 1], 75)),
        api.listTransactions(addDays(today(), -365), addDays(today(), 31)),
      ])
      setExisting(near)
      setItems(buildPreview({ rows: st.rows, ids, card: pmCard, existing: near, learned: learnCategories(history), categories: idx.all }))
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setBusy(null)
    }
  }

  async function pickFile(f: File | undefined, pdfPassword?: string) {
    setError('')
    setItems(null)
    if (!f) return
    setFileName(f.name)
    setBusy('Lendo o arquivo…')
    try {
      const st = await readStatementFile(f, pdfPassword)
      setLocked(null)
      setPassword('')
      setStatement(st)
      // extrato de cartão: já sugere o cartão (se houver um só)
      let pmId = paymentId
      const cards = paymentMethods.filter((m) => isCard(m) && !m.archived)
      if (st.card && !isCard(paymentMethods.find((m) => m.id === pmId)) && cards.length === 1) pmId = cards[0].id
      setPaymentId(pmId)
      await prepare(st, pmId)
    } catch (e: any) {
      setStatement(null)
      if (e instanceof PdfPasswordError) setLocked({ file: f, wrong: e.wrong })
      else setError(e?.message ?? String(e))
    } finally {
      setBusy(null)
    }
  }

  function changePayment(id: string | null) {
    setPaymentId(id)
    if (statement) prepare(statement, id)
  }

  const set = (i: number, patch: Partial<ImportItem>) => setItems((list) => list!.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const chosen = useMemo(() => (items ?? []).filter((i) => i.include), [items])
  const totals = useMemo(() => ({
    out: chosen.filter((i) => i.kind === 'expense').reduce((s, i) => s + i.amount, 0),
    in: chosen.filter((i) => i.kind === 'income').reduce((s, i) => s + i.amount, 0),
    settle: chosen.filter((i) => i.status === 'settle').length,
  }), [chosen])

  async function save() {
    if (!chosen.length || busy) return
    setBusy('Importando…')
    const affected = chosen.filter((i) => i.kind === 'expense').map((i) => (card ? invoiceFor(card, i.date).due : i.date))
    const ok = await watchBudget(affected, () => run(async () => {
      for (const [n, it] of chosen.entries()) {
        setBusy(`Importando ${n + 1} de ${chosen.length}…`)
        if (it.status === 'settle' && it.settleId) {
          const t = existing.find((x) => x.id === it.settleId)!
          await markPaid({ ...t, category_id: t.category_id ?? it.categoryId }, { amount: it.amount, paidAt: it.date })
          continue
        }
        const base = {
          id: it.id, kind: it.kind, amount: it.amount, description: it.description, category_id: it.categoryId,
          payment_method_id: paymentId, notes: null, installment_plan_id: null, installment_number: null,
          recurring_bill_id: null, recurring_month: null, receipt_path: null,
        }
        if (card && it.kind === 'expense') {
          // compra no cartão: entra na fatura e é paga junto com ela
          await api.saveTransaction({ ...base, date: invoiceFor(card, it.date).due, purchase_date: it.date, paid: false, paid_at: null })
        } else {
          await api.saveTransaction({ ...base, date: it.date, paid: true, paid_at: it.date })
        }
      }
      return true
    }))
    setBusy(null)
    if (ok) {
      bump()
      toast(`${chosen.length} lançamento(s) importado(s) ✓`)
      nav('/lancamentos')
    }
  }

  if (!canEdit) return <div className="screen narrow"><p className="note">Você só pode visualizar estas finanças.</p></div>

  return (
    <div className="screen narrow import-screen">
      <header className="top"><Link to="/lancamentos" className="icon-btn" aria-label="Voltar"><Icon name="left" /></Link><h1>Importar extrato</h1><span /></header>

      <section className="card">
        <p className="small">
          No app ou site do seu banco, procure <b>Exportar extrato</b> (ou a fatura do cartão) e salve no celular ou no computador.
        </p>
        <div className="import-formats" aria-label="Formatos aceitos">
          <span className="chip">OFX</span><span className="chip">CSV</span><span className="chip">Excel (.xlsx)</span><span className="chip">PDF</span>
        </div>
        {/* sem filtro de tipo: o celular não reconhece .ofx e deixaria o arquivo cinza; o formato é conferido pelo conteúdo */}
        <input ref={input} type="file" hidden onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
        <button
          type="button"
          className={`import-drop ${dragging ? 'on' : ''}`}
          onClick={() => input.current?.click()}
          disabled={!!busy}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0]) }}
        >
          <Icon name="download" size={26} />
          <b>{fileName ? 'Escolher outro arquivo' : 'Escolher o arquivo do extrato'}</b>
          <span className="muted small">ou arraste o arquivo para cá</span>
        </button>
        {locked && (
          <form className="import-password" onSubmit={(e) => { e.preventDefault(); if (password) pickFile(locked.file, password) }}>
            <Field label="Este PDF tem senha" hint={locked.wrong ? 'Senha incorreta. Tente de novo.' : 'Muitos bancos usam os primeiros dígitos do CPF. A senha não é guardada.'}>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="off" inputMode="text" />
            </Field>
            <button className="btn primary" disabled={!password || !!busy}>Abrir</button>
          </form>
        )}
        {fileName && statement && <p className="muted small">📄 {fileName} · {statement.format} · {statement.rows.length} lançamento(s)</p>}
        <Field label="De qual conta ou cartão é este extrato?" hint={card ? `Cartão: as compras entram nas faturas (fecha dia ${card.closing_day}, vence dia ${card.due_day}).` : 'Os lançamentos ficam com esta forma de pagamento.'}>
          <PaymentSelect value={paymentId} onChange={changePayment} />
        </Field>
        {statement?.card && !card && <p className="note small">Este arquivo parece ser de cartão de crédito. Escolha o cartão acima para as compras entrarem na fatura certa.</p>}
        {error && <p className="alert">{error}</p>}
        {busy && <p className="muted small"><span className="spinner inline" /> {busy}</p>}
        {statement?.format.startsWith('PDF') && items && (
          <p className="note small">O PDF foi lido automaticamente: confira datas e valores. Se algum veio como gasto e era ganho (ou o contrário), toque no valor para trocar.</p>
        )}
      </section>

      {items && (
        <>
          <div className="totals-bar import-totals">
            <span>Selecionados <b>{chosen.length}</b> de {items.length}</span>
            <span>Gastos <b className="neg">{money(totals.out)}</b></span>
            {totals.in > 0 && <span>Ganhos <b className="pos">{money(totals.in)}</b></span>}
            {totals.settle > 0 && <span>Baixas <b>{totals.settle}</b></span>}
          </div>
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setItems(items.map((i) => ({ ...i, include: !(card && i.kind === 'income') && i.status !== 'duplicate' })))}>Marcar todos</button>
            <button className="btn ghost" onClick={() => setItems(items.map((i) => ({ ...i, include: false })))}>Desmarcar todos</button>
          </div>

          <div className="card flush import-list">
            {items.map((it, i) => {
              const fixed = it.status === 'duplicate' || (Boolean(card) && it.kind === 'income')
              return (
                <div key={it.id} className={`import-row ${it.include ? '' : 'off'}`}>
                  <label className="import-check">
                    <input type="checkbox" checked={it.include} disabled={fixed} onChange={(e) => set(i, { include: e.target.checked })} aria-label={`Importar ${it.description}`} />
                  </label>
                  <div className="import-main">
                    <div className="import-top">
                      <span className="import-desc">{it.description}</span>
                      <button
                        type="button" className={`import-amount ${it.kind === 'expense' ? 'neg' : 'pos'}`} disabled={it.status === 'duplicate'}
                        title="Trocar entre gasto e ganho" aria-label={`${it.kind === 'expense' ? 'Gasto' : 'Ganho'} de ${money(it.amount)}. Tocar para trocar`}
                        onClick={() => {
                          const kind = it.kind === 'expense' ? 'income' : 'expense'
                          const reset = it.status === 'settle' || it.status === 'skip'
                          set(i, { kind, categoryId: null, ...(reset ? { status: 'new', settleId: undefined, note: undefined } : {}), include: !(card && kind === 'income') && (reset || it.include) })
                        }}
                      >{it.kind === 'expense' ? '−' : '+'} {money(it.amount)}</button>
                    </div>
                    <div className="import-meta">
                      <span className="muted small">{fmt.day(it.date)}{card && it.kind === 'expense' && ` · fatura ${fmt.short(invoiceFor(card, it.date).due)}`}</span>
                      {it.note && <span className={`chip ${it.status === 'settle' ? 'good' : it.status === 'new' ? '' : 'warn'}`}>{it.note}</span>}
                    </div>
                    {it.include && it.status !== 'settle' && (
                      <CategorySelect kind={it.kind} value={it.categoryId} onChange={(id) => set(i, { categoryId: id })} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <button className="btn primary block import-save" disabled={!chosen.length || !!busy} onClick={save}>
            {busy ?? `Importar ${chosen.length} lançamento(s)`}
          </button>
          <p className="muted small center">Importar o mesmo arquivo de novo não duplica: o que já entrou aparece como "Já importado antes".</p>
        </>
      )}
    </div>
  )
}
