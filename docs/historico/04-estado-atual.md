# 04 — Estado atual (30/10/2026)

Versão publicada: **v1.1.10** (`Fynvault.apk` na página de Releases). Banco: migrations **0001–0004 aplicadas**.

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
| README atualizado, 65 testes automáticos, CI gerando APK | Pronto |
| Versão web instalável (PWA) no GitHub Pages: computador e iPhone (Adicionar à Tela de Início) | Pronto (falta ativar Pages › Source: GitHub Actions) |

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

1. Instalar a v1.1.10 por cima e testar offline (modo avião → lançar/pagar → voltar → "Tudo sincronizado ✓").
2. Testar o modo família com uma segunda conta (visualizar, editar, remover).
3. Testar PIN/biometria e a notificação de teste (Ajustes → Lembretes).
4. Reportar qualquer problema com print.
5. Se for publicar: criar chave de release Android e conta Google Play; para iPhone, conta Apple Developer.
6. Opcional: decidir sobre renomear o repositório para `fynvault`.
