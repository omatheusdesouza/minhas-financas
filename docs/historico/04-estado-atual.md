# 04 — Estado atual (31/10/2026)

Versão publicada: **v1.1.10** (`Fynvault.apk` na página de Releases). Banco: migrations **0001–0008 aplicadas**.

## Pronto

| Área | Situação |
|---|---|
| Conta (e-mail/senha, recuperação por código) | Pronto |
| Lançamentos de gastos e ganhos, categorias editáveis (com subcategorias), formas de pagamento | Pronto |
| Parcelamentos (promissória) | Pronto |
| Contas recorrentes (meses curtos, geração automática, fixo/variável, "Marcar como paga" com comprovante, "Informar valor") | Pronto |
| Saúde financeira, relatórios semanal/quinzenal/mensal/período | Pronto |
| Renomeação Fynvault (id técnico mantido) | Pronto |
| Identidade visual, ícones, splash, imagens de loja, modo escuro | Pronto |
| Perfil com nome + emoji/foto (bucket privado) | Pronto |
| Onboarding obrigatório (perfil, rendas, gastos fixos com modelos, lembretes, meta) | Pronto |
| Lembretes locais (10 dias, 2 dias crítico, vence hoje, vencida diária, aporte mensal), horário, canais | Pronto |
| Dashboard (cartões, próximas contas por cor, meta) | Pronto |
| Orçamento por categoria, metas com histórico, comparação com período anterior | Pronto |
| Exportação PDF e Excel | Pronto |
| Bloqueio por PIN e biometria | Pronto |
| Offline + sincronização sem duplicar | Pronto |
| Modo família com convite e permissões | Pronto |
| RLS em todas as tabelas, buckets privados, sem segredos no repositório | Pronto |
| Layout para computador (menu lateral, colunas, atalhos de teclado) | Pronto |
| Alertas de limite por categoria (80% e 100%, aviso ao salvar, cartão no Início) | Pronto |
| Importar extrato (OFX/CSV, prévia, categoria sugerida, sem duplicar, dar baixa, cartão → faturas) | Pronto |
| Cartão de crédito com fatura (fechamento, vencimento, limite, parcelado, pagar fatura, conta no mês da fatura) | Pronto (migration 0007 aplicada) |
| Reservas (adicionar, retirar, ajustar, enviar parte do salário; relatório "Enviado para reservas") | Pronto (migration 0006 aplicada) |
| Capacitor 8 (Android SDK 36, mínimo Android 7; iOS 15 com UIScene; Java 21 no CI) | Pronto; APK compilado no CI, falta testar no celular |
| Dependências atualizadas (segurança), CI em Node 22, backup semanal criptografado e suporte à chave privada do Android | Pronto (backup e chave privada dependem de secrets no GitHub) |
| LGPD: Política de Privacidade, Termos, aceite, baixar dados, excluir conta | Pronto (migration 0005 aplicada; revisão jurídica recomendada) |
| Proteção do site (CSP, não abre dentro de outro site, build sem comentários), senha com letras e números | Pronto |
| Painel do gestor (pessoas, acessos, alertas, bloquear/excluir conta), limite no convite da família, verificação diária no GitHub | Pronto (migration 0008 aplicada em 31/10/2026); aviso por e-mail depende do secret `SUPABASE_DB_URL` |
| README atualizado, 94 testes automáticos, CI gerando APK | Pronto |
| Versão web instalável (PWA) no GitHub Pages: computador e iPhone (Adicionar à Tela de Início) | Pronto (Site URL do Supabase ajustada; testado no iPhone em 30/10/2026) |

## Parcial / não verificado

- **Testes em aparelho real ainda não feitos pelo usuário na v1.1.10:** modo avião, convite de família,
  biometria, notificações com o app fechado. No ambiente de desenvolvimento só foi possível testar no navegador
  contra um Supabase simulado.
- **iOS:** projeto `ios/` pronto, mas instalar no iPhone exige Mac com Xcode ou conta Apple Developer
  (US$ 99/ano) — não feito.
- **Assinatura Android:** APK de debug (chave de debug fixa). Serve para instalar manualmente; Play Store exige
  chave de release.

## Faltando (não pedido ou fora do escopo atual)

- Publicação nas lojas (Play Store / App Store).
- Notificações push do servidor (hoje são locais, o que atende aos requisitos).
- Renomear o repositório GitHub (aguarda confirmação do usuário; `minhas-financas` mantido).

## Bugs conhecidos

- Nenhum bug aberto conhecido. Todos os encontrados nos testes foram corrigidos (lista em `02-decisoes.md` e no
  resumo). Pontos de atenção em aparelho real:
  - Economia de bateria agressiva (Xiaomi, Samsung, Motorola) pode atrasar lembretes — o app orienta liberar.
  - Primeira abertura após atualizar precisa de internet (download inicial dos dados).
  - Modo família: o lembrete só avisa das próprias contas (decisão), não das do espaço compartilhado.

## Próximos passos (prioridade)

0. **Pendente (lembrar o usuário):** o ramo `carregamento-leve` no GitHub guarda o carregamento mais leve, ainda não
   publicado. Ele carrega as telas e o gráfico do Início sob demanda. Falta medir o tamanho, testar no navegador,
   criar os testes de tela (Playwright) no CI e juntar ao `main`. Lembrete relacionado: o vite-plugin-pwa 1.x precisa de
   `skipWaiting`/`clientsClaim` no `vite.config.ts` (já corrigido no `main`), senão a versão nova fica esperando até fechar
   todas as janelas do app.

1. Confirmar o cadastro do gestor (README › 5) e ligar Dependabot alerts e Secret scanning no GitHub.
   Opcional no Supabase: CAPTCHA no login, verificação em duas etapas (MFA) e Leaked password protection (plano Pro).
2. Instalar a v1.1.10 por cima e testar offline (modo avião → lançar/pagar → voltar → "Tudo sincronizado ✓").
3. Testar o modo família com uma segunda conta (visualizar, editar, remover).
4. Testar PIN/biometria e a notificação de teste (Ajustes → Lembretes).
5. Reportar qualquer problema com print.
6. Se for publicar: criar chave de release Android e conta Google Play; para iPhone, conta Apple Developer.
7. Opcional: decidir sobre renomear o repositório para `fynvault`.
