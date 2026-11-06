# 01 — Resumo geral (cronológico)

Projeto: **Fynvault** (antes "Minhas Finanças"), app de finanças pessoais para Android e iOS.
Repositório: `omatheusdesouza/minhas-financas` (branch `main`). Toda a conversa aconteceu em 30/10/2026.

> Valores sensíveis (URL do projeto Supabase, chaves, senhas) estão só em `SEGREDOS.local.md`
> (arquivo local, fora do Git): [VEJA SEGREDOS.local.md].

## 1. Primeira versão — "Minhas Finanças" (madrugada)

1. Pedido inicial: app Android de finanças para lançar compras e ganhos, organizar parcelas da promissória,
   contas fixas de casa, carro (combustível/conserto), besteiras, compras para casa, roupas, fast food;
   indicador de saúde financeira; relatórios semanal, quinzenal, mensal e por período escolhido.
2. Requisitos complementares (respondidos em perguntas): conta própria com e-mail/senha, dados hospedados
   na nuvem, total controle para editar categorias de gastos e ganhos, **Android e iOS**, **instalado (não web)**.
3. Construído: React + TypeScript + Vite empacotado com Capacitor 6; Supabase (Postgres + Auth) com RLS;
   migration `0001_inicial.sql` (categorias, formas de pagamento, parcelamentos, contas recorrentes, lançamentos).
4. Como o ambiente de desenvolvimento não acessa os servidores do Google (Android SDK/Maven), o APK passou a
   ser gerado no **GitHub Actions**, publicado na página de Releases.
5. Guia passo a passo para o usuário: criar projeto Supabase, rodar o SQL no SQL Editor ("Success. No rows
   returned"), configurar provedor de e-mail, copiar Project URL e chave anon, criar os *secrets* no GitHub.
6. O primeiro APK abriu em modo demonstração porque os secrets ainda não existiam; após cadastrá-los, novo build.
7. Usuário instalou, criou a conta e confirmou: "funcionou".

## 2. Upgrade Fynvault (especificação em fases)

O usuário enviou uma especificação completa (ver `03-prompts-importantes.md`).

- **Fase 0 — Relatório:** stack, pastas, tabelas e checklist OK/parcial/faltando.
- **Fase 1 — Renomeação:** nome exibido "Fynvault" em telas, títulos, Android/iOS (`strings.xml`, `Info.plist`),
  README, workflow, package.json. Identificador técnico `br.com.minhasfinancas.app` **mantido**. Repositório
  **não** renomeado (não houve confirmação).
- **Fase 2 — Identidade visual:** antes de aplicar, prévias em imagem. Escolhas do usuário: fundo claro
  (off-white "gelo"), o mais sofisticado possível, monograma "F" refeito com aparência luxuosa, fonte
  **Cormorant**, **sem a seta de crescimento**. Gerados: SVGs da marca (`public/brand/`), ícones adaptativos
  Android, ícones iOS, splash, favicon, imagens das lojas (`store/`), modo escuro e escolha de tema.
- **Fase 3A — Base de dados nova (migration 0002):** perfil (`profiles`), contas de valor variável, origem da renda,
  comprovante em lançamentos, metas (`savings_goals`, `goal_contributions`), buckets privados `avatars` e `receipts`.
  Usuário aplicou a 0002 ("Success").
- **Fase 3A/3B — Perfil, onboarding e contas:** perfil com nome + emoji ou foto; onboarding obrigatório em etapas
  (Perfil, Rendas fixas, Gastos fixos com modelos prontos, Lembretes, Meta opcional); "Marcar como paga" com
  comprovante; "Informar valor" nas variáveis; recorrência com meses curtos; dashboard com cartões e cores.
- **Fase 3C — Lembretes no celular:** notificações locais (funcionam com app fechado): 10 dias antes (informar valor
  das variáveis), 2 dias antes (crítico), no vencimento, vencida diariamente, aporte mensal da meta; horário
  configurável; dois canais Android; orientação sobre economia de bateria; testes automáticos.
- **Fase 3D — Metas, comparação e exportação:** tela de metas com progresso, previsão e histórico de aportes;
  comparação com o período anterior ("sua conta de luz subiu 18%"); relatório em PDF (jsPDF) e Excel (ExcelJS);
  últimos 6 meses no dashboard/relatórios.
- **Fase 4 — Segurança + bloqueio:** RLS em todas as tabelas, buckets privados, verificação de segredos no
  histórico do Git (nenhum encontrado), só chave anon no cliente; bloqueio do app por PIN (PBKDF2) e biometria
  com armazenamento seguro (Keystore/Keychain).
- **Fase 3E — Offline e sincronização (migration 0003):** cópia local em IndexedDB, fila de envio, motor de
  sincronização (envio em ordem, busca por `updated_at`, exclusões via `deleted_rows`, conflito por
  `client_updated_at`), ids estáveis para contas do mês (sem duplicar). O usuário pediu para continuar sem
  aguardar aprovações ("CONTINUAR A PROGRAMAR SEM MINHA APROVAÇÃO!").
- **Fase 3F — Modo família (migration 0004):** convite por código de 6 caracteres (7 dias), papéis "Só visualizar"
  e "Pode editar", seletor de espaço, remoção e saída, regras de segurança no banco (`can_access`, `same_family`).
- Release final desta conversa: **v1.1.10** (APK `Fynvault.apk`).
- Usuário aplicou 0003 e 0004 ("Success"). Banco está em 0001–0004.

## 3. Verificação feita no ambiente de desenvolvimento

- 65 testes unitários (Vitest): datas, recorrência, lembretes, notificações, comparação/metas, exportação,
  bloqueio, sincronização (inclui família) e banco local.
- Testes ponta a ponta (Playwright) contra um "Supabase falso" local (PostgreSQL real + migrations reais):
  9 cenários offline e 7 de família passaram; regressões do modo demonstração passaram.
- **Não** testado aqui: o Supabase real do usuário e aparelhos reais (biometria, notificações, modo avião).

## 4. Última etapa

Criação desta pasta `docs/historico/` para levar o histórico a outro lugar.

## 5. Versão web (30/10/2026)

O app passou a rodar também no navegador como app instalável (PWA), publicado no GitHub Pages
(`https://omatheusdesouza.github.io/minhas-financas/`) pelo workflow `web.yml`. No iPhone é instalado pelo
Safari (Adicionar à Tela de Início), já que o iOS não instala APK. Site URL do Supabase apontada para o site.
Testado pelo usuário no iPhone. Na web não há lembretes com o app fechado nem biometria; o PIN funciona.

## 6. Segurança e painel do gestor (31/10/2026)

O usuário pediu para "bloquear o código" que aparece no F12 e deixar o app o mais seguro possível. Explicado que o
código de um site sempre chega ao navegador (e o repositório é público); a proteção real está no banco. Feito:
política de segurança de conteúdo (CSP) na versão web, bloqueio de abrir o site dentro de outro, build sem comentários,
senha com letras e números. Depois o usuário pediu um "app de gestor": virou a tela **Painel do gestor** dentro do
próprio app (migration 0008), com pessoas, acessos e senhas erradas, alertas automáticos, bloquear e excluir conta, e
uma verificação diária no GitHub que abre issue (sem dados pessoais) quando há alerta novo ou biblioteca com falha.
Política de Privacidade atualizada (registros de segurança por 90 dias) e versão dos termos trocada (novo aceite).

## 7. Capacitor 8 (01/11/2026)

O Dependabot apontou 11 falhas (6 graves); as graves e a crítica vinham do CLI do Capacitor 6. O app foi atualizado para o
Capacitor 8 com todos os plugins, Android SDK 36 (mínimo Android 7), Java 21 e iOS 15. O APK foi compilado no CI a partir
de um ramo de teste antes de juntar ao main.

## 8. Importar PDF e revisão visual (01/11/2026)

O usuário relatou que importar CSV e OFX não funcionava e pediu PDF. Causa provável: o seletor filtrava por tipo e o celular
não reconhece .ofx (arquivo cinza); e o CSV só era lido com o cabeçalho na 1ª linha. Agora o seletor aceita qualquer arquivo
(o tipo é conferido pelo conteúdo), o CSV/Excel acha o cabeçalho em qualquer linha (ou as colunas pelo conteúdo) e há leitura
de PDF (inclusive com senha) e de .xlsx. Também: saudação do Início compacta, listas com o nome curto da categoria,
animações de entrada, toque e painéis (respeitando "reduzir movimento").

## 9. Dashboard personalizável (01/11/2026)

Pedido: "uma dashboard ... definindo o que a pessoa quer escolher para navegar". Perguntado o tipo, o usuário escolheu
"os dois juntos": Início com blocos escolhidos pela pessoa (ligar, desligar, ordenar) e navegação personalizada (3 atalhos
da barra de baixo, com o Início fixo; itens e ordem do menu lateral, com Cartões, Importar e Família como opções). Tela
Ajustes › Personalizar. Salvo no aparelho e na conta.

## 10. Visual luxo e minimalista (01/11/2026)

Pedido: "deixar o mais luxuoso e minimalista possível". Feito num ramo (`visual-luxo`) com capturas de antes e depois;
o usuário aprovou e foi publicado. Serifada (Cormorant, números alinhados) nos títulos e valores grandes, tons mais
sóbrios, status como texto com ponto, ícones neutros, cartões leves, botão + azul com dourado.

## 11. Celular sem cortes e Caixa (01/11/2026)

O usuário relatou que o tema novo ficou grande no celular e cortava informações. Reproduzido em 360px: valores em
serifada não encolhiam (cartão de gastos fixos saía da tela) e as linhas de lançamento espremiam a descrição. Corrigido com
fontes que se adaptam à largura e linhas compactas (status embaixo da descrição em telas estreitas).
Depois, o **Caixa** (migration 0009): contas com saldo exato informado, total, escolha da conta ao lançar/pagar/receber e na
fatura do cartão, transferências e ajustes que não contam como gasto ou ganho, bloco no Início e item no menu.

## 12. Cartão ligado ao banco (01/11/2026)

O usuário cadastrou as contas e pediu para informar de qual banco é cada cartão. Migration 0010: cada cartão ou forma de
pagamento pode ser ligado a uma conta do caixa. Débito/Pix ligados descontam sozinhos da conta; a fatura do crédito
sugere a conta ligada ao pagar (dá para trocar). Aviso antes de ligar uma forma que já tem lançamentos pagos no período.

## 13. Plano de pagamento (05–06/11/2026)

Pedido: saber que conta pagar primeiro, recebendo em datas diferentes, com níveis de prioridade. Feito: aba Contas › Plano,
quatro níveis (sugeridos pela categoria, ajustáveis), simulação de 45 dias com o Caixa e os ganhos a receber, bloco "Pague
primeiro" no Início (migration 0011 para guardar a prioridade escolhida). Durante o trabalho o usuário pediu: sem pagamento
parcial (juros do cartão, boleto não aceita) e mostrar quanto do dinheiro de hoje sobra se os ganhos entrarem no prazo.

