import type { Kind, Nature } from './types'

interface Seed {
  name: string
  icon: string
  color: string
  nature: Nature
  children?: { name: string; icon: string; nature?: Nature }[]
}

/** Categorias iniciais. O usuário pode editar, renomear, arquivar ou excluir todas. */
export const DEFAULT_CATEGORIES: Record<Kind, Seed[]> = {
  expense: [
    {
      name: 'Casa – contas fixas', icon: '🏠', color: '#0ea5e9', nature: 'essencial',
      children: [
        { name: 'Aluguel / financiamento', icon: '🔑' },
        { name: 'Energia', icon: '💡' },
        { name: 'Água', icon: '🚿' },
        { name: 'Internet / telefone', icon: '📶' },
        { name: 'Gás', icon: '🔥' },
        { name: 'Condomínio / IPTU', icon: '🏢' },
      ],
    },
    {
      name: 'Compras para casa', icon: '🛒', color: '#22c55e', nature: 'essencial',
      children: [
        { name: 'Supermercado', icon: '🥦' },
        { name: 'Limpeza e higiene', icon: '🧴' },
        { name: 'Utensílios e móveis', icon: '🛋️' },
      ],
    },
    {
      name: 'Carro', icon: '🚗', color: '#f97316', nature: 'essencial',
      children: [
        { name: 'Combustível', icon: '⛽' },
        { name: 'Conserto e manutenção', icon: '🔧' },
        { name: 'Seguro, IPVA e licenciamento', icon: '📄' },
        { name: 'Estacionamento e pedágio', icon: '🅿️' },
        { name: 'Lavagem e acessórios', icon: '🧽', nature: 'superfluo' },
      ],
    },
    {
      name: 'Fast food e delivery', icon: '🍔', color: '#ef4444', nature: 'superfluo',
      children: [
        { name: 'Lanches', icon: '🍟' },
        { name: 'Delivery', icon: '🛵' },
        { name: 'Restaurantes', icon: '🍽️' },
      ],
    },
    {
      name: 'Shopping e roupas', icon: '🛍️', color: '#a855f7', nature: 'superfluo',
      children: [
        { name: 'Roupas', icon: '👕' },
        { name: 'Calçados', icon: '👟' },
        { name: 'Acessórios', icon: '👜' },
      ],
    },
    {
      name: 'Besteiras', icon: '🍬', color: '#ec4899', nature: 'superfluo',
      children: [
        { name: 'Doces e lanchinhos', icon: '🍫' },
        { name: 'Compras por impulso', icon: '🎁' },
        { name: 'Apps e assinaturas', icon: '📱' },
      ],
    },
    {
      name: 'Promissórias e parcelas', icon: '🧾', color: '#eab308', nature: 'essencial',
    },
    {
      name: 'Saúde', icon: '💊', color: '#14b8a6', nature: 'essencial',
      children: [
        { name: 'Farmácia', icon: '💊' },
        { name: 'Consultas e exames', icon: '🩺' },
        { name: 'Plano de saúde', icon: '🏥' },
      ],
    },
    { name: 'Lazer', icon: '🎉', color: '#6366f1', nature: 'superfluo' },
    { name: 'Educação', icon: '📚', color: '#0d9488', nature: 'essencial' },
    { name: 'Investimentos e reserva', icon: '🐷', color: '#16a34a', nature: 'investimento' },
    { name: 'Outros gastos', icon: '📦', color: '#64748b', nature: 'essencial' },
  ],
  income: [
    { name: 'Salário', icon: '💼', color: '#16a34a', nature: 'essencial' },
    { name: 'Renda extra / freelas', icon: '💡', color: '#0ea5e9', nature: 'essencial' },
    { name: 'Vendas', icon: '🏷️', color: '#f59e0b', nature: 'essencial' },
    { name: 'Rendimentos', icon: '📈', color: '#8b5cf6', nature: 'investimento' },
    { name: 'Reembolsos e presentes', icon: '🎁', color: '#ec4899', nature: 'essencial' },
    { name: 'Outros ganhos', icon: '💰', color: '#64748b', nature: 'essencial' },
  ],
}

export const DEFAULT_PAYMENT_METHODS = [
  'Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Promissória', 'Boleto',
]

export const CATEGORY_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#16a34a', '#14b8a6',
  '#0d9488', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#64748b',
]

export const CATEGORY_ICONS = [
  '🏠', '🔑', '💡', '🚿', '📶', '🔥', '🏢', '🛒', '🥦', '🧴', '🛋️', '🚗', '⛽', '🔧', '📄', '🅿️',
  '🍔', '🍟', '🛵', '🍽️', '☕', '🍺', '🛍️', '👕', '👟', '👜', '🍬', '🍫', '🎁', '📱', '🧾', '💊',
  '🩺', '🏥', '🎉', '🎬', '✈️', '📚', '🎓', '🐶', '👶', '💇', '🏋️', '🐷', '📈', '💼', '💰', '🏷️',
  '💳', '🧑‍🔧', '⚽', '🎮', '💄', '🧸', '📦', '❤️',
]
