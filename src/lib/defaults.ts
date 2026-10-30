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
      name: 'Casa – contas fixas', icon: '🏠', color: '#1F5F7A', nature: 'essencial',
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
      name: 'Compras para casa', icon: '🛒', color: '#2F6B57', nature: 'essencial',
      children: [
        { name: 'Supermercado', icon: '🥦' },
        { name: 'Limpeza e higiene', icon: '🧴' },
        { name: 'Utensílios e móveis', icon: '🛋️' },
      ],
    },
    {
      name: 'Carro', icon: '🚗', color: '#C27C4E', nature: 'essencial',
      children: [
        { name: 'Combustível', icon: '⛽' },
        { name: 'Conserto e manutenção', icon: '🔧' },
        { name: 'Seguro, IPVA e licenciamento', icon: '📄' },
        { name: 'Estacionamento e pedágio', icon: '🅿️' },
        { name: 'Lavagem e acessórios', icon: '🧽', nature: 'superfluo' },
      ],
    },
    {
      name: 'Fast food e delivery', icon: '🍔', color: '#A4553F', nature: 'superfluo',
      children: [
        { name: 'Lanches', icon: '🍟' },
        { name: 'Delivery', icon: '🛵' },
        { name: 'Restaurantes', icon: '🍽️' },
      ],
    },
    {
      name: 'Shopping e roupas', icon: '🛍️', color: '#7A4E7E', nature: 'superfluo',
      children: [
        { name: 'Roupas', icon: '👕' },
        { name: 'Calçados', icon: '👟' },
        { name: 'Acessórios', icon: '👜' },
      ],
    },
    {
      name: 'Besteiras', icon: '🍬', color: '#B07F8C', nature: 'superfluo',
      children: [
        { name: 'Doces e lanchinhos', icon: '🍫' },
        { name: 'Compras por impulso', icon: '🎁' },
        { name: 'Apps e assinaturas', icon: '📱' },
      ],
    },
    {
      name: 'Promissórias e parcelas', icon: '🧾', color: '#B8964F', nature: 'essencial',
    },
    {
      name: 'Saúde', icon: '💊', color: '#3E7C8C', nature: 'essencial',
      children: [
        { name: 'Farmácia', icon: '💊' },
        { name: 'Consultas e exames', icon: '🩺' },
        { name: 'Plano de saúde', icon: '🏥' },
      ],
    },
    { name: 'Lazer', icon: '🎉', color: '#4E5D8C', nature: 'superfluo' },
    { name: 'Educação', icon: '📚', color: '#5F7F9E', nature: 'essencial' },
    { name: 'Investimentos e reserva', icon: '🐷', color: '#6E8B4E', nature: 'investimento' },
    { name: 'Outros gastos', icon: '📦', color: '#6B7A85', nature: 'essencial' },
  ],
  income: [
    { name: 'Salário', icon: '💼', color: '#2F6B57', nature: 'essencial' },
    { name: 'Renda extra / freelas', icon: '💡', color: '#1F5F7A', nature: 'essencial' },
    { name: 'Vendas', icon: '🏷️', color: '#B8964F', nature: 'essencial' },
    { name: 'Rendimentos', icon: '📈', color: '#6E8B4E', nature: 'investimento' },
    { name: 'Reembolsos e presentes', icon: '🎁', color: '#B07F8C', nature: 'essencial' },
    { name: 'Outros ganhos', icon: '💰', color: '#6B7A85', nature: 'essencial' },
  ],
}

export const DEFAULT_PAYMENT_METHODS = [
  'Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Promissória', 'Boleto',
]

/** Paleta Fynvault: tons de joia que combinam com o azul-petróleo e o dourado. */
export const CATEGORY_COLORS = [
  '#1F5F7A', '#3E7C8C', '#5F7F9E', '#4E5D8C', '#2F6B57', '#6E8B4E', '#8A9A8F', '#B8964F',
  '#D2A86A', '#C27C4E', '#A4553F', '#8E3B46', '#B07F8C', '#7A4E7E', '#9C8A6E', '#6B7A85',
]

/** Cores padrão da primeira versão do app → equivalentes na paleta Fynvault. */
export const LEGACY_COLOR_MAP: Record<string, string> = {
  '#0ea5e9': '#1F5F7A', '#22c55e': '#2F6B57', '#f97316': '#C27C4E', '#ef4444': '#A4553F',
  '#a855f7': '#7A4E7E', '#ec4899': '#B07F8C', '#eab308': '#B8964F', '#14b8a6': '#3E7C8C',
  '#6366f1': '#4E5D8C', '#0d9488': '#5F7F9E', '#16a34a': '#6E8B4E', '#64748b': '#6B7A85',
  '#f59e0b': '#B8964F', '#8b5cf6': '#7A4E7E', '#84cc16': '#6E8B4E', '#3b82f6': '#4E5D8C',
}

export const CATEGORY_ICONS = [
  '🏠', '🔑', '💡', '🚿', '📶', '🔥', '🏢', '🛒', '🥦', '🧴', '🛋️', '🚗', '⛽', '🔧', '📄', '🅿️',
  '🍔', '🍟', '🛵', '🍽️', '☕', '🍺', '🛍️', '👕', '👟', '👜', '🍬', '🍫', '🎁', '📱', '🧾', '💊',
  '🩺', '🏥', '🎉', '🎬', '✈️', '📚', '🎓', '🐶', '👶', '💇', '🏋️', '🐷', '📈', '💼', '💰', '🏷️',
  '💳', '🧑‍🔧', '⚽', '🎮', '💄', '🧸', '📦', '❤️',
]
