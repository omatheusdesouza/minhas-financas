# 03 — Prompts importantes (na íntegra)

Mensagens do usuário em ordem. Respostas curtas de confirmação ("pronto", "Sim!") estão agrupadas.
Itens marcados *(resposta a pergunta)* foram respostas de múltipla escolha, registradas pelo sentido.

## Início

> Claude quero fazer um app para android de financias.

> Quero para minhas financias, acaba que preciso de um app que me permita adicionar todas as compras que eu fizer,
> e todos os ganhos que eu tiver, e organizar as contas futuras de parcelas que compro na promissoria, organizar as
> contas fixas de casa, contas que vou gastando com carro, conserto e consumo, contas que compro de besteiras,
> compras para casa, compras em shopping de roupa, ou compras de comidas fast food.
>
> Preciso de um app que me acompanhe no dia a dia. Que me mostre como está minhas saúde financeira, que eu possa
> solicitar relatorios semanais, quinzenais, mensais, periodos escolhidos.

*(respostas a perguntas)*

> Preciso de algo que eu crie uma conta para mim. Que eu tenha onde hospedar de forma online para que eu não perca
> todos meus dados. Quero um app sofisticado, que eu possa ter total controle de edição do que eu quero definir nos
> gastos e nos ganhos.

> Pensando bem, quero que tenha compatibilidade nos dois softwares, android e ios.

> Preciso instalar o app, não quero que seja na web.

## Configuração guiada

> É para eu abrir o arquivo sql no meu pc e copiar o conteudo de lá?

> Apareceu: Success. No rows returned.
>
> Me guie nos proximos passos que não estou entendendo

(prints das telas do Supabase) · "Consegui" · link do repositório `https://github.com/omatheusdesouza/minhas-financas.git`
· "pronto" (várias vezes)

> instalei e criei a conta, funcionou.

> Vamos fazer Upgrades que já testei e quero fazer agora.

## Especificação Fynvault (íntegra)

```markdown
# Fynvault: renomeação, nova identidade e melhorias

O app hoje se chama "Minhas Finanças", já está rodando, com dados na nuvem (Supabase) e código no GitHub. O novo nome é **Fynvault** (slogan discreto: "Personal finance"). Não reconstrua nada do zero. Trabalhe em fases, mostre o plano antes de começar cada uma e faça commits pequenos com mensagens claras.

## Fase 0: Leitura e relatório
Leia o código e me entregue um resumo curto: stack, estrutura de pastas, tabelas do Supabase e o que já existe das funcionalidades abaixo (OK / parcial / faltando).

## Fase 1: Renomeação para Fynvault
- Troque o nome exibido em todo o app: título, splash, telas, textos, notificações, README, package.json/app.json e metadados.
- Atenção: NÃO altere o identificador técnico do app (bundle id / package name / slug) se o app já estiver publicado ou instalado, pois isso quebra atualizações. Se ainda não estiver publicado, me pergunte antes de decidir.
- Não renomeie tabelas ou colunas do Supabase sem migration versionada e sem preservar os dados.
- Renomeie o repositório do GitHub apenas se eu confirmar.

## Fase 2: Identidade visual
- Paleta: azul-petróleo #0B2A3C (principal), dourado #D8B36A (destaque), off-white #F2EBDD (fundo claro). Estilo sofisticado e limpo. Logotipo em serifa elegante; interface em sans-serif legível.
- Logo: escudo azul-petróleo com contorno interno dourado fino, monograma "F" em linhas douradas e uma pequena seta de crescimento dourada. Abaixo, o código SVG do ícone (crie também a versão horizontal com o texto "Fynvault" em serifa e "PERSONAL FINANCE" em caixa-alta espaçada):

<svg xmlns="http://www.w3.org/2000/svg" viewBox="90 40 150 260">
  <g transform="translate(-20,-10)">
    <path fill="#0B2A3C" d="M120 60 L200 60 Q250 60 250 110 L250 190 Q250 260 185 300 Q120 260 120 190 Z"/>
    <path fill="none" stroke="#D8B36A" stroke-width="1.5" opacity="0.55" stroke-linecap="round" stroke-linejoin="round" d="M126 80 L226 80 Q232 80 232 86 L232 190 Q232 244 185 276 Q138 244 138 190 L138 86 Q138 80 144 80 Z"/>
    <g fill="none" stroke="#D8B36A" stroke-linecap="round" stroke-linejoin="round">
      <path stroke-width="5" d="M158 235 L158 125 L214 125"/>
      <path stroke-width="5" d="M158 172 L198 172"/>
      <path stroke-width="4" d="M172 215 L196 190 L212 202 L240 160"/>
    </g>
    <path fill="#D8B36A" d="M228 156 L246 150 L242 170 Z"/>
  </g>
</svg>

- Gere a partir dele: ícone do app (Android adaptive icon e iOS), splash screen, favicon e imagem para as lojas.
- Implemente modo escuro, com a mesma paleta adaptada.

## Fase 3: Funcionalidades (implemente só o que estiver faltando ou parcial)

### 3.1 Perfil
Nome ou apelido (obrigatório) e foto de perfil: emoji ou imagem importada da galeria/câmera, exibida em círculo. Fotos no Supabase Storage em bucket privado, com acesso só do dono.

### 3.2 Onboarding obrigatório (em etapas, com barra de progresso)
A dashboard só aparece após concluir as etapas 1 e 2.
- Etapa 1, rendas fixas: "Você recebe algum valor fixo por mês?" Se sim, adicionar várias rendas, cada uma com valor, origem (trabalho, aluguel, pensão, benefício, outro) e dia do recebimento.
- Etapa 2, gastos fixos: várias contas, cada uma com nome, categoria, tipo de valor (fixo ou variável, como água e energia) e dia de vencimento. Oferecer modelos prontos (água, energia, internet, aluguel, escola, plano de saúde, cartão). Cada conta cadastrada entra automaticamente em Dívidas/Contas a pagar; nas variáveis, o valor é preenchido depois.
- Etapa 3, meta de economia (opcional): objetivo e aporte mensal.

### 3.3 Contas recorrentes
A conta do mês seguinte é gerada automaticamente após o pagamento ou vencimento. Tratar meses curtos (dia 29, 30, 31). Botão "Marcar como paga" com opção de anexar comprovante e "Informar valor" nas variáveis.

### 3.4 Alertas e lembretes no celular (funcionando com o app fechado)
- 10 dias antes: lembrete diário para informar o valor das contas variáveis sem valor; para assim que o valor é preenchido.
- 2 dias antes: alerta crítico (prioridade alta, vermelho).
- No vencimento: aviso "vence hoje".
- 1 dia depois: alerta de conta vencida, repetido até marcar como paga.
- Lembrete mensal para aporte na meta de economia.
- Reagendar ou cancelar automaticamente ao editar, pagar ou excluir a conta.
- Horário dos lembretes configurável. Pedir permissão de notificações no onboarding, explicando o motivo. No Android, usar canais separados (normal e crítico) e orientar sobre economia de bateria.

### 3.5 Dashboard
Cabeçalho com foto e nome/apelido; cartões com renda fixa total, gastos fixos, saldo previsto e progresso da meta; lista das próximas contas por vencimento com cores (verde em dia, amarelo perto de vencer, vermelho vencida ou crítica).

### 3.6 Melhorias recomendadas
1. Gastos variáveis do dia a dia (mercado, lazer, combustível) com orçamento por categoria.
2. Metas de economia com progresso visual e histórico de aportes.
3. Gráficos mensais e comparação com o mês anterior (ex.: "sua conta de luz subiu 18%").
4. Modo família: compartilhar contas com outra pessoa, com permissões diferentes.
5. Exportar relatório em PDF e Excel.
6. Bloqueio do app por biometria ou PIN (guardar em armazenamento seguro).
7. Backup e sincronização na nuvem, sem duplicar dados ao voltar da conexão offline.

## Fase 4: Segurança (prioridade alta, pode ser feita antes das outras)
- Row Level Security ativo em todas as tabelas do Supabase; cada usuário só acessa os próprios dados (no modo família, só os compartilhados).
- Nenhuma chave secreta (service role) ou arquivo .env no repositório ou no app; só a chave pública (anon) no cliente. Verifique o .gitignore e o histórico do Git em busca de segredos já commitados.
- Buckets de fotos e comprovantes com acesso restrito ao dono.

## Regras gerais
- Mostre o plano e espere minha confirmação antes de mudar a estrutura do banco.
- Toda mudança de schema por migration versionada, sem apagar dados existentes.
- Validação em todos os formulários (valores, datas, dia de 1 a 31).
- Testes para a recorrência das contas e para o agendamento dos alertas (10 dias, 2 dias, vencimento, 1 dia depois).
- Atualize o README com o novo nome e as instruções para rodar.
- Ao final de cada fase, explique como testar.
```

## Durante as fases

> Pode começar a fase 1

> Pode me mostrar em imagem antes como fica?

> Fundo claro. coloque o mais sofisticado possivel.
> Gostaria que refizesse o F da logo. está muito simples, coloque como se parecesse luxuoso, afinal estamos
> trabalhando com financias.

> Pode retirar essa seta de crescimento. Quem usa o app já sabe para que ele serve.
> A cormorant.

> Prossiga

> Aprovado, pode seguir com a 0002 e a 3A

> Apliquei a 0002, deu Success

> Sim! · Pode seguir com a 3C · Pode seguir com a 3D · Pode preparar o plano da 3E

> Aprovado, pode seguir com a 0003 e a 3E

> CONTINUAR A PROGRAMAR SEM MINHA APROVAÇÃO!
> Atingi meu limite de uso enquanto você trabalhava, mas ele já foi reiniciado. Por favor, continue de onde parou.

> Apliquei a 0003 e a 0004, deu Success

## Exportação do histórico

> Quero levar o histórico desta conversa para outro lugar. Crie na raiz do projeto a pasta docs/historico/ e salve
> nela, em arquivos .md: (01-resumo-geral, 02-decisoes, 03-prompts-importantes, 04-estado-atual, 05-configuracao,
> SEGREDOS.local.md) … Regras obrigatórias: adicionar SEGREDOS.local.md ao .gitignore antes, confirmar com
> `git check-ignore -v`, nenhum segredo nos outros arquivos (usar [VEJA SEGREDOS.local.md]), atualizar o CLAUDE.md,
> commit e push só dos arquivos permitidos e mostrar `git status`.
