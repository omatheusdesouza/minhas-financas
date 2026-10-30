/** Textos legais (LGPD). Ao mudar o conteúdo, troque LEGAL_VERSION: o app pede um novo aceite. */
export const LEGAL_VERSION = '2026-10-30'
export const LEGAL_DATE = '30 de outubro de 2026'

export const CONTROLLER = {
  name: 'Matheus de Souza Oliveira',
  email: 'matheusoliveiragerente@gmail.com',
}

/** Um parágrafo é texto; uma lista de textos vira tópicos. */
export type LegalBlock = string | string[]
export interface LegalSection { title: string; body: LegalBlock[] }

export const PRIVACY: LegalSection[] = [
  {
    title: '1. Quem cuida dos seus dados',
    body: [
      `O Fynvault é um app de finanças pessoais mantido por ${CONTROLLER.name}, que é o controlador dos dados pessoais `
      + 'tratados no app, nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018, "LGPD").',
      `Para qualquer assunto sobre privacidade, inclusive como encarregado pelo tratamento de dados, fale com: ${CONTROLLER.email}.`,
    ],
  },
  {
    title: '2. Quais dados o app trata',
    body: [
      [
        'Conta: seu e-mail e sua senha. A senha é guardada pelo provedor de login de forma cifrada (hash); ninguém consegue lê-la.',
        'Perfil: o nome ou apelido que você escolher e, se quiser, um emoji ou uma foto.',
        'Dados financeiros que você mesmo digita: lançamentos de gastos e ganhos, categorias, limites, formas de pagamento, '
        + 'contas fixas, parcelamentos, metas de economia, aportes e observações.',
        'Comprovantes: fotos ou PDFs que você decidir anexar.',
        'Modo família: quem você convidou para ver ou editar suas finanças, com qual permissão, e os convites criados.',
        'Registros técnicos: datas de criação e alteração dos dados (para sincronizar entre aparelhos) e a data e a versão '
        + 'em que você aceitou estes termos.',
      ],
      'O app não pede nem acessa senhas de banco, cartões, localização, contatos ou a sua digital ou rosto, e não usa '
      + 'cookies de publicidade, rastreadores ou ferramentas de análise de terceiros.',
    ],
  },
  {
    title: '3. Para que usamos e com qual base legal',
    body: [
      [
        'Para prestar o serviço que você pediu: guardar e mostrar suas finanças, gerar relatórios, lembretes e sincronizar '
        + 'seus aparelhos — base legal: execução de contrato (art. 7º, V, da LGPD).',
        'Para manter o serviço seguro, evitar acessos indevidos e corrigir falhas — base legal: legítimo interesse '
        + '(art. 7º, IX), sempre limitado ao necessário.',
        'Para cumprir obrigações legais ou ordens de autoridades, quando houver — base legal: art. 7º, II e VI.',
      ],
      'Os dados não são vendidos, não são usados para publicidade e não são usados para criar perfis sobre você.',
      'Dados sensíveis: o app não pede dados sensíveis (como saúde, religião ou biometria). Um comprovante que você anexar '
      + 'pode conter esse tipo de informação (por exemplo, um recibo de farmácia); nesse caso ele é apenas guardado para você.',
    ],
  },
  {
    title: '4. Onde os dados ficam e com quem são compartilhados',
    body: [
      [
        'Supabase (operador): guarda o banco de dados, os arquivos e o login, em servidores na região de São Paulo. '
        + 'Como a Supabase é uma empresa sediada nos Estados Unidos, pode haver transferência internacional de dados, feita '
        + 'com as garantias contratuais de proteção de dados do provedor (art. 33 da LGPD).',
        'GitHub Pages: hospeda apenas o código do site. Seus dados financeiros não passam por ele; como qualquer site, ele '
        + 'recebe o endereço IP de quem acessa.',
        'Pessoas que você convidar no modo família: veem (e, se você permitir, editam) as suas finanças. Você pode mudar a '
        + 'permissão ou remover o acesso a qualquer momento.',
        'Autoridades: somente quando a lei exigir ou houver ordem judicial.',
      ],
    ],
  },
  {
    title: '5. No seu aparelho',
    body: [
      'Para funcionar sem internet, o app guarda uma cópia dos seus dados no próprio aparelho (armazenamento do navegador ou '
      + 'do app). Essa cópia é apagada quando você sai da conta.',
      'O PIN de bloqueio fica só no aparelho, guardado como hash, e nunca vai para a nuvem. A digital e o reconhecimento '
      + 'facial são verificados pelo sistema do celular; o app só recebe a resposta "reconhecido" ou "não reconhecido".',
      'Os lembretes são notificações locais, criadas no próprio aparelho, e dependem da sua permissão.',
    ],
  },
  {
    title: '6. Por quanto tempo',
    body: [
      'Os dados ficam guardados enquanto a sua conta existir. Quando você exclui a conta (Ajustes › Privacidade e dados), '
      + 'todos os seus dados e arquivos são apagados na hora. Cópias de segurança automáticas do provedor, quando existem, '
      + 'são descartadas no ciclo normal delas, em até 30 dias.',
    ],
  },
  {
    title: '7. Seus direitos',
    body: [
      'Pela LGPD (art. 18), você pode a qualquer momento:',
      [
        'confirmar que tratamos seus dados e acessá-los;',
        'corrigir dados incompletos ou errados (direto no app);',
        'pedir a anonimização, o bloqueio ou a eliminação de dados desnecessários;',
        'levar seus dados para outro serviço (portabilidade);',
        'eliminar seus dados e a sua conta;',
        'saber com quem seus dados são compartilhados;',
        'revogar consentimentos e se opor a tratamentos que considere irregulares.',
      ],
      'No app: Ajustes › Privacidade e dados tem "Baixar todos os meus dados", "Quem acessa meus dados" e "Excluir minha conta". '
      + `Para os demais pedidos, escreva para ${CONTROLLER.email}; respondemos em até 15 dias.`,
      'Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD): www.gov.br/anpd.',
    ],
  },
  {
    title: '8. Segurança',
    body: [
      'Toda comunicação é cifrada (HTTPS). No banco, cada pessoa só consegue acessar os próprios dados e os espaços que '
      + 'foram compartilhados com ela. Fotos e comprovantes ficam em armazenamento privado e só abrem por links temporários. '
      + 'Você ainda pode bloquear o app com PIN ou biometria.',
      'Se acontecer um incidente de segurança que possa trazer risco ou dano relevante, avisaremos você e a ANPD, como '
      + 'determina o art. 48 da LGPD.',
    ],
  },
  {
    title: '9. Idade',
    body: ['O Fynvault é destinado a maiores de 18 anos. Menores só podem usar com o consentimento e o acompanhamento de um dos pais ou responsável.'],
  },
  {
    title: '10. Mudanças nesta política',
    body: [
      'Se esta política mudar, a data no topo é atualizada e o app pede que você leia e aceite a nova versão antes de continuar.',
    ],
  },
]

export const TERMS: LegalSection[] = [
  {
    title: '1. O serviço',
    body: [
      'O Fynvault é uma ferramenta gratuita para você organizar suas finanças pessoais: registrar gastos e ganhos, contas, '
      + 'parcelas e metas. Ele não movimenta dinheiro, não se conecta a bancos e não é consultoria financeira, contábil ou '
      + 'de investimentos: as decisões continuam sendo suas.',
    ],
  },
  {
    title: '2. Sua conta',
    body: [
      [
        'Você deve ter 18 anos ou mais, ou usar com o acompanhamento de um responsável.',
        'Use um e-mail seu e uma senha só sua; você é responsável por mantê-la em segredo.',
        'As informações que você registra são de sua responsabilidade.',
      ],
    ],
  },
  {
    title: '3. Modo família',
    body: [
      'Ao convidar alguém, você autoriza essa pessoa a ver (e, se escolher, editar) as suas finanças. Convide apenas quem '
      + 'você confia; você pode remover o acesso quando quiser. Quem é convidado deve respeitar a privacidade de quem compartilhou.',
    ],
  },
  {
    title: '4. Uso permitido',
    body: [
      'Não é permitido usar o app para atividades ilegais, tentar acessar dados de outras pessoas, sobrecarregar ou atacar '
      + 'o serviço. Contas usadas dessa forma podem ser suspensas.',
    ],
  },
  {
    title: '5. Disponibilidade',
    body: [
      'Fazemos o possível para manter o app funcionando e seus dados seguros, mas o serviço é oferecido sem garantia de '
      + 'funcionamento ininterrupto. Recomendamos baixar seus dados de tempos em tempos (Ajustes › Privacidade e dados).',
    ],
  },
  {
    title: '6. Encerramento',
    body: ['Você pode excluir sua conta a qualquer momento pelo app; seus dados são apagados conforme a Política de Privacidade.'],
  },
  {
    title: '7. Lei aplicável e contato',
    body: [
      'Estes termos seguem as leis brasileiras, inclusive o Código de Defesa do Consumidor e a LGPD. Fica eleito o foro do '
      + `seu domicílio. Dúvidas: ${CONTROLLER.email}.`,
    ],
  },
]
