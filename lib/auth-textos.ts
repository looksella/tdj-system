/**
 * TODO el texto visible del login, en los dos idiomas.
 *
 * Por qué existe
 * --------------
 * Las pantallas de auth son la PRIMERA pantalla de toda app con login, y no
 * las lee el dueño: las leen sus empleados y sus clientes, cada vez que
 * entran. Estaban enteras en castellano rioplatense — "Iniciá sesión",
 * "Repetí la contraseña" — así que el usuario final de un sistema brasileño
 * no podía ni entrar sin leer voseo argentino.
 *
 * Por qué es un archivo de PLOMERÍA y no vive en cada pantalla
 * -----------------------------------------------------------
 * Las pantallas del overlay son `overwrite=False`: se escriben solo si no
 * existen, porque el dueño pudo haberlas personalizado. Un pack adentro de
 * cada pantalla no llegaría nunca a un proyecto que ya las tiene. Este archivo
 * es `overwrite=True`, así que su versión canónica siempre gana.
 *
 * El idioma sale del NEGOCIO (`lib/beon-idioma.ts`), no del visitante:
 * `navigator.language` le mostraría castellano al empleado brasileño que tiene
 * el teléfono en inglés.
 *
 * `Record<Idioma, T>` obliga por tipos a que `pt` tenga TODO lo que tiene
 * `es`: una clave que falte no compila, y el CI buildea estas apps de verdad.
 */
import { packDeTextos } from "./beon-idioma";
export const AUTH_COPY = {
  es: {
    comun: {
      cargando: "Cargando…",
      email: "Email",
      emailPlaceholder: "tu@email.com",
      password: "Contraseña",
      passwordPlaceholder: "••••••••",
      noConfigurado: "La autenticación no está configurada en este entorno.",
      volverAlLogin: "Volver al inicio de sesión",
      revisaTuEmail: "Revisá tu email",
      // Lo que queda en los logs de Vercel (y en el mensaje del error del
      // sandbox) si algo construye el cliente de Supabase con el login
      // dormido. Reemplaza al críptico `supabaseUrl is required` de la
      // librería. En producción la pantalla sigue siendo el global-error
      // genérico: Next reemplaza el mensaje por un digest.
      loginDormidoServidor:
        "El login de este sistema no está activo: se activa desde TuSistema con un plan. Esta acción lo necesita.",
    },
    // Lo que se ve en `/sign-in`, `/setup` y `/admin/usuarios` mientras el
    // login todavía no está activo. Vive acá y no en el componente porque es
    // la pantalla MÁS probable de un sistema recién nacido: si se hornea, el
    // dueño brasileño lee castellano justo en la primera pantalla que abre.
    loginInactivo: {
      abierto:
        "El login de tu sistema todavía no está activo, así que por ahora cualquiera con el link entra.",
      comoSeActiva:
        "Se activa desde TuSistema.AI con un plan. Ahí vas a poder invitar a las personas que usan el sistema y darles un rol.",
    },
    // SPEC_INVITACIONES_QUE_NO_SE_QUEMAN Bloque 2 — la pantalla `/auth/acceso`,
    // donde aterriza un link de email que no se pudo verificar. Antes el
    // aterrizaje era el login con un código de error colgado de la URL: un
    // formulario idéntico al normal, con una palabra en inglés en la barra de
    // direcciones y cero explicación de qué pasó ni de cómo salir.
    acceso: {
      usadoTitulo: "Este link ya se usó",
      usadoDetalle:
        "Los links de invitación sirven una sola vez. Si no llegaste a elegir tu contraseña, pedí uno nuevo desde acá.",
      registroListoTitulo: "Tu cuenta ya está confirmada",
      registroListoDetalle:
        "Este link de confirmación ya se usó. Entrá con tu email y tu contraseña.",
      incompletoTitulo: "El link llegó cortado",
      incompletoDetalle:
        "Copialo entero desde el mensaje que recibiste, o pedí uno nuevo desde acá.",
      genericoTitulo: "No pudimos verificar este link",
      genericoDetalle:
        "Puede haber vencido o haberse usado antes. Pedí uno nuevo y volvé a intentar.",
      ctaLinkNuevo: "Recibir un link nuevo",
      ctaIniciarSesion: "Ir a iniciar sesión",
    },
    // SPEC_INVITACIONES_QUE_NO_SE_QUEMAN Bloque 4 — la pantalla intermedia de
    // `/confirmar`. El `GET` del link ya no verifica nada: quien lo abre ve
    // esto, y el token recién se consume cuando una PERSONA aprieta el botón.
    // Antes lo quemaba cualquier cosa que siguiera el link (el unfurler de
    // Slack, el escáner de Gmail, la previsualización de WhatsApp), y la
    // invitación llegaba rota sin que nadie pudiera reconstruir por qué.
    confirmar: {
      inviteTitulo: "Activá tu cuenta",
      inviteDetalle: "Vas a elegir tu contraseña para entrar al sistema.",
      inviteCta: "Activar mi cuenta",
      recoveryTitulo: "Elegí una contraseña nueva",
      recoveryDetalle:
        "Confirmá que sos vos y te llevamos a elegir tu contraseña.",
      recoveryCta: "Continuar",
      signupTitulo: "Confirmá tu email",
      signupDetalle: "Un último paso para terminar de crear tu cuenta.",
      signupCta: "Confirmar mi email",
      genericoTitulo: "Confirmá que sos vos",
      genericoDetalle: "Apretá el botón para continuar.",
      genericoCta: "Continuar",
      porQue:
        "Pedimos este paso porque el link sirve una sola vez, y algunos chats y correos lo abren solos para mostrar una vista previa.",
    },
    signIn: {
      titulo: "Iniciar sesión",
      enviando: "Entrando...",
      cta: "Ingresar",
      olvide: "¿Olvidaste tu contraseña?",
      sinCuentaPregunta: "¿No tenés cuenta?",
      sinCuentaCta: "Registrate",
    },
    signUp: {
      titulo: "Crear cuenta",
      passwordPlaceholder: "Mínimo 8 caracteres, con letras y números",
      enviando: "Creando cuenta...",
      cta: "Registrarse",
      yaTengoPregunta: "¿Ya tenés cuenta?",
      yaTengoCta: "Iniciá sesión",
      revisaTuEmailDetalle:
        "Te enviamos un link para confirmar tu cuenta. Puede tardar unos minutos. Revisá también la carpeta de spam.",
    },
    forgot: {
      titulo: "Olvidé mi contraseña",
      bajada: "Ingresá tu email y te enviamos un link para crear una contraseña nueva.",
      enviando: "Enviando...",
      cta: "Enviar link",
      revisaTuEmailDetalle:
        "Te enviamos un link para restablecer tu contraseña. Puede tardar unos minutos. Revisá también la carpeta de spam.",
    },
    reset: {
      titulo: "Nueva contraseña",
      bajada: "Elegí una contraseña nueva para tu cuenta.",
      label: "Nueva contraseña",
      passwordPlaceholder: "Mínimo 8 caracteres, con letras y números",
      labelConfirmar: "Confirmá la contraseña",
      confirmarPlaceholder: "Repetí tu contraseña",
      noCoinciden: "Las contraseñas no coinciden.",
      enviando: "Guardando...",
      cta: "Guardar contraseña",
      errorGenerico: "No se pudo guardar la contraseña. Probá de nuevo.",
    },
    setup: {
      sinTokenTitulo: "Falta un paso en TuSistema",
      sinTokenP1:
        "Esta pantalla no se completa desde acá. Tu cuenta de dueño se crea con un link que trae tu clave de configuración, y ese link te lo da TuSistema en la tarjeta de acceso de tu proyecto, recién cuando publicás el sistema.",
      sinTokenP2:
        "No hay nada que esperar en esta página: volvé a TuSistema, publicá tu sistema y desde ahí creá tu cuenta.",
      cerradoTitulo: "Todo listo",
      cerradoDetalle:
        "La cuenta de administrador ya está creada. Iniciá sesión con tu email y contraseña.",
      cerradoCta: "Ir a iniciar sesión",
      listoTitulo: "¡Cuenta creada!",
      listoDetalle:
        "Ya sos el administrador. Ingresá con el email y la contraseña que elegiste.",
      listoCta: "Iniciar sesión",
      titulo: "Configuración inicial",
      bajada:
        "Creá tu cuenta de administrador. Después vas a poder invitar a tu equipo desde el sistema.",
      passwordPlaceholder: "Mínimo 8 caracteres, con letras y números",
      repetirPlaceholder: "Repetí la contraseña",
      enviando: "Creando...",
      cta: "Crear cuenta de administrador",
      noCoinciden: "Las contraseñas no coinciden.",
      errorGenerico: "No se pudo crear la cuenta.",
      linkInvalido:
        "Este link no es válido. Tu cuenta de dueño se crea desde TuSistema, en la tarjeta de acceso de tu proyecto.",
    },
    usuarios: {
      tituloPagina: "Usuarios",
      bajadaPagina: "Invitá a las personas que van a usar el sistema.",
      soloYo: "Solo yo",
      invitarTitulo: "Invitar usuario",
      // SPEC_INVITACIONES_QUE_NO_SE_QUEMAN Bloque 4 — la nota vieja hablaba
      // del tope de 2 emails/hora del plan gratuito de Supabase y empujaba al
      // admin hacia el link, que es el camino frágil. Ese tope ya no existe:
      // con el SMTP de la plataforma cada proyecto sale por Resend.
      ayudaInvitar:
        "Podés invitar por email o generar un link para compartir a mano. Los emails salen por el servidor de TuSistema.",
      metodo: "Método de entrega",
      metodoEmail: "Enviar por email",
      metodoLink: "Generar link para compartir",
      invitando: "Invitando...",
      invitar: "Invitar",
      invitacionEnviada: "Invitación enviada ✓",
      linkCopiado: "Link copiado",
      errorInvitar: "No se pudo enviar la invitación.",
      errorLink: "No se pudo generar el link.",
      rateLimitLink:
        "Se alcanzó el límite de emails de este momento — copiá este link y enviáselo vos a la persona",
      listaTitulo: "Usuarios del sistema",
      colEmail: "Email",
      colAlta: "Alta",
      colRol: "Rol",
      emailPlaceholder: "persona@email.com",
      copiar: "Copiar",
      copiarLink: "Copiar link",
      sinUsuarios: "Todavía no hay usuarios invitados.",
      linkNota24h:
        "Link válido por 24 h. Copiálo y enviáselo a la persona (WhatsApp, etc.). No se envía ningún email.",
      // Ya no es fatal (el link se consume recién cuando la persona aprieta el
      // botón de /confirmar), pero sigue siendo la práctica correcta.
      avisoCompartirLink:
        "Mandáselo directo a la persona. Algunos chats abren los links para previsualizarlos.",
      colEstado: "Estado",
      // Los tres estados, con las palabras del dueño. El del medio es el que
      // faltaba: abrió el link del mail y nunca eligió contraseña, así que no
      // puede entrar aunque el panel lo mostrara como activo.
      estadoActiva: "Activa",
      estadoAbrioSinActivar: "Abrió el link, falta la contraseña",
      estadoPendiente: "Invitación pendiente",
      reenviarLink: "Reenviar link",
      quitar: "Quitar del sistema",
      quitarConfirma: "Para confirmar, escribí el email de esa persona.",
      quitarCta: "Quitar",
      cancelar: "Cancelar",
      quitado: "Listo, esa persona ya no entra al sistema.",
      errorQuitar: "No se pudo quitar a esa persona.",
    },
    api: {
      datosInvalidos: "Datos inválidos",
      faltaEmailOPassword: "Completá email y contraseña",
      passwordCorta: "Mínimo 8 caracteres, con letras y números",
      setupYaCompletado: "La configuración inicial ya fue completada. Iniciá sesión.",
      personaNoEncontrada: "No encontramos a esa persona en la lista de usuarios.",
      personaYaActiva: "Esta persona ya eligió su contraseña, así que no necesita un link de invitación. Si no puede entrar, decile que use «Olvidé mi contraseña» en /forgot-password.",
      noTePodesQuitar: "No podés quitarte a vos mismo del sistema.",
      fundadorNoSeQuita: "No se puede quitar a quien creó el sistema: esa cuenta es la del dueño y siempre tiene que poder entrar.",
      demasiadosUsuarios: "Hay demasiados usuarios para verificar quién creó el sistema, así que por seguridad no se quita a nadie.",
      ultimoAdmin: "No podés quitar al último administrador: el sistema quedaría sin nadie que pueda administrarlo.",
      noSePudoQuitar: "No se pudo quitar a esa persona.",
      rolInvalido: "Ese rol no existe en este sistema.",
      rolNoAplicado:
        "No pudimos asignarle el rol a esa persona. Probá de nuevo.",
      planRequerido:
        "Con el plan gratis entra solo el dueño. Para sumar personas, el dueño activa un plan en TuSistema.",
      cupoSinVerificar:
        "No pude verificar el plan del sistema. Prueba de nuevo en un rato.",
    },
    errores: {
      rateLimit:
        "Se alcanzó el límite de emails de este momento. Generá un link de invitación y enviáselo vos, o esperá unos minutos.",
      // El mismo error visto desde el otro lado del mostrador: acá lo lee el
      // cliente del dueño, que no puede generar ningún link ni hacer nada. Lo
      // único accionable es esperar, y que sepa que sus datos están bien.
      rateLimitRegistro:
        "Hay muchos registros al mismo tiempo. Esperá unos minutos y volvé a intentar — tus datos están bien.",
      yaRegistrado: "Ya existe un usuario registrado con ese email.",
      emailInvalido: "El email ingresado no es válido.",
      invitacionGenerico:
        "No se pudo enviar la invitación. Revisá el dashboard de Supabase para más detalles.",
      // SPEC_LOGIN_APPS_FUERZA_BRUTA Bloque 2 — lo que exige GoTrue al elegir
      // contraseña (largo, letras y números, no filtrada). Las pantallas lo
      // chequean antes de llamar, y si igual llega `weak_password`, es esto.
      passwordDebil:
        "La contraseña tiene que tener al menos 8 caracteres, con letras y números, y no puede ser una contraseña filtrada.",
      // El `weak_password` cuyo ÚNICO motivo es `pwned` (HIBP): la contraseña
      // ya cumple el largo y los caracteres, así que repetirle la regla entera
      // no le dice qué cambiar.
      passwordFiltrada:
        "Esa contraseña apareció en filtraciones públicas. Elegí otra que no uses en otros sitios.",
      // GoTrue devuelve `invalid_credentials` tanto para una contraseña mala
      // como para el bloqueo por intentos fallidos (mismo código, solo cambia
      // el texto en inglés). No se decide por texto: un mensaje cubre los dos.
      credencialesInvalidas:
        "Email o contraseña incorrectos. Si fallaste varias veces seguidas, esperá unos minutos antes de volver a probar.",
      loginGenerico: "No se pudo iniciar sesión. Probá de nuevo.",
      emailSinConfirmar:
        "Todavía no confirmaste tu email. Buscá el mail de confirmación que te enviamos (revisá también la carpeta de spam) y abrí el link.",
      passwordIgual: "La contraseña nueva tiene que ser distinta de la anterior.",
    },
  },
  pt: {
    comun: {
      cargando: "Carregando…",
      email: "E-mail",
      emailPlaceholder: "voce@email.com",
      password: "Senha",
      passwordPlaceholder: "••••••••",
      noConfigurado: "A autenticação não está configurada neste ambiente.",
      volverAlLogin: "Voltar para o login",
      revisaTuEmail: "Confira seu e-mail",
      loginDormidoServidor:
        "O login deste sistema não está ativo: ele é ativado no TeuSistema com um plano. Esta ação precisa dele.",
    },
    loginInactivo: {
      abierto:
        "O login do seu sistema ainda não está ativo, então por enquanto qualquer pessoa com o link entra.",
      comoSeActiva:
        "Ele é ativado no TeuSistema.AI com um plano. Lá você vai poder convidar as pessoas que usam o sistema e dar um papel para cada uma.",
    },
    acceso: {
      usadoTitulo: "Este link já foi usado",
      usadoDetalle:
        "Os links de convite valem uma única vez. Se você não chegou a escolher sua senha, peça um novo por aqui.",
      registroListoTitulo: "Sua conta já está confirmada",
      registroListoDetalle:
        "Este link de confirmação já foi usado. Entre com seu e-mail e sua senha.",
      incompletoTitulo: "O link chegou cortado",
      incompletoDetalle:
        "Copie o link inteiro da mensagem que você recebeu, ou peça um novo por aqui.",
      genericoTitulo: "Não conseguimos verificar este link",
      genericoDetalle:
        "Ele pode ter vencido ou já ter sido usado. Peça um novo e tente de novo.",
      ctaLinkNuevo: "Receber um link novo",
      ctaIniciarSesion: "Ir para o login",
    },
    confirmar: {
      inviteTitulo: "Ative sua conta",
      inviteDetalle: "Você vai escolher sua senha para entrar no sistema.",
      inviteCta: "Ativar minha conta",
      recoveryTitulo: "Escolha uma senha nova",
      recoveryDetalle:
        "Confirme que é você e levamos você para escolher sua senha.",
      recoveryCta: "Continuar",
      signupTitulo: "Confirme seu e-mail",
      signupDetalle: "Um último passo para terminar de criar sua conta.",
      signupCta: "Confirmar meu e-mail",
      genericoTitulo: "Confirme que é você",
      genericoDetalle: "Toque no botão para continuar.",
      genericoCta: "Continuar",
      porQue:
        "Pedimos este passo porque o link vale uma única vez, e alguns chats e e-mails o abrem sozinhos para mostrar uma pré-visualização.",
    },
    signIn: {
      titulo: "Entrar",
      enviando: "Entrando...",
      cta: "Entrar",
      olvide: "Esqueceu sua senha?",
      sinCuentaPregunta: "Não tem conta?",
      sinCuentaCta: "Criar conta",
    },
    signUp: {
      titulo: "Criar conta",
      passwordPlaceholder: "Mínimo de 8 caracteres, com letras e números",
      enviando: "Criando conta...",
      cta: "Cadastrar",
      yaTengoPregunta: "Já tem conta?",
      yaTengoCta: "Entrar",
      revisaTuEmailDetalle:
        "Enviamos um link para confirmar sua conta. Pode levar alguns minutos. Confira também a caixa de spam.",
    },
    forgot: {
      titulo: "Esqueci minha senha",
      bajada: "Informe seu e-mail e enviamos um link para você criar uma senha nova.",
      enviando: "Enviando...",
      cta: "Enviar link",
      revisaTuEmailDetalle:
        "Enviamos um link para redefinir sua senha. Pode levar alguns minutos. Confira também a caixa de spam.",
    },
    reset: {
      titulo: "Nova senha",
      bajada: "Escolha uma senha nova para sua conta.",
      label: "Nova senha",
      passwordPlaceholder: "Mínimo de 8 caracteres, com letras e números",
      labelConfirmar: "Confirme a senha",
      confirmarPlaceholder: "Repita sua senha",
      noCoinciden: "As senhas não coincidem.",
      enviando: "Salvando...",
      cta: "Salvar senha",
      errorGenerico: "Não foi possível salvar a senha. Tente de novo.",
    },
    setup: {
      sinTokenTitulo: "Falta um passo no TeuSistema",
      sinTokenP1:
        "Esta tela não se completa por aqui. Sua conta de dono é criada com um link que leva sua chave de configuração, e esse link o TeuSistema te dá no cartão de acesso do seu projeto, só depois que você publica o sistema.",
      sinTokenP2:
        "Não há nada para esperar nesta página: volte para o TeuSistema, publique seu sistema e crie sua conta a partir de lá.",
      cerradoTitulo: "Tudo pronto",
      cerradoDetalle:
        "A conta de administrador já está criada. Entre com seu e-mail e senha.",
      cerradoCta: "Ir para o login",
      listoTitulo: "Conta criada!",
      listoDetalle:
        "Você já é o administrador. Entre com o e-mail e a senha que escolheu.",
      listoCta: "Entrar",
      titulo: "Configuração inicial",
      bajada:
        "Crie sua conta de administrador. Depois você vai poder convidar sua equipe pelo sistema.",
      passwordPlaceholder: "Mínimo de 8 caracteres, com letras e números",
      repetirPlaceholder: "Repita a senha",
      enviando: "Criando...",
      cta: "Criar conta de administrador",
      noCoinciden: "As senhas não coincidem.",
      errorGenerico: "Não foi possível criar a conta.",
      linkInvalido:
        "Este link não é válido. Sua conta de dono é criada no TeuSistema, a partir do cartão de acesso do seu projeto.",
    },
    usuarios: {
      tituloPagina: "Usuários",
      bajadaPagina: "Convide as pessoas que vão usar o sistema.",
      soloYo: "Só eu",
      invitarTitulo: "Convidar usuário",
      ayudaInvitar:
        "Você pode convidar por e-mail ou gerar um link para compartilhar na mão. Os e-mails saem pelo servidor do TeuSistema.",
      metodo: "Forma de envio",
      metodoEmail: "Enviar por e-mail",
      metodoLink: "Gerar link para compartilhar",
      invitando: "Convidando...",
      invitar: "Convidar",
      invitacionEnviada: "Convite enviado ✓",
      linkCopiado: "Link copiado",
      errorInvitar: "Não foi possível enviar o convite.",
      errorLink: "Não foi possível gerar o link.",
      rateLimitLink:
        "O limite de e-mails deste momento foi atingido — copie este link e envie você mesmo para a pessoa",
      listaTitulo: "Usuários do sistema",
      colEmail: "E-mail",
      colAlta: "Cadastro",
      colRol: "Papel",
      emailPlaceholder: "pessoa@email.com",
      copiar: "Copiar",
      copiarLink: "Copiar link",
      sinUsuarios: "Ainda não há usuários convidados.",
      linkNota24h:
        "Link válido por 24 h. Copie e envie para a pessoa (WhatsApp, etc.). Nenhum e-mail é enviado.",
      avisoCompartirLink:
        "Envie direto para a pessoa. Alguns chats abrem os links para gerar a pré-visualização.",
      colEstado: "Situação",
      estadoActiva: "Ativa",
      estadoAbrioSinActivar: "Abriu o link, falta a senha",
      estadoPendiente: "Convite pendente",
      reenviarLink: "Reenviar link",
      quitar: "Remover do sistema",
      quitarConfirma: "Para confirmar, digite o e-mail dessa pessoa.",
      quitarCta: "Remover",
      cancelar: "Cancelar",
      quitado: "Pronto, essa pessoa não entra mais no sistema.",
      errorQuitar: "Não foi possível remover essa pessoa.",
    },
    api: {
      datosInvalidos: "Dados inválidos",
      faltaEmailOPassword: "Preencha e-mail e senha",
      passwordCorta: "Mínimo de 8 caracteres, com letras e números",
      setupYaCompletado: "A configuração inicial já foi concluída. Faça login.",
      personaNoEncontrada: "Não encontramos essa pessoa na lista de usuários.",
      personaYaActiva: "Essa pessoa já escolheu a senha, então não precisa de link de convite. Se ela não conseguir entrar, peça que use «Esqueci minha senha» em /forgot-password.",
      noTePodesQuitar: "Você não pode remover a si mesmo do sistema.",
      fundadorNoSeQuita: "Não é possível remover quem criou o sistema: essa conta é a do dono e sempre precisa conseguir entrar.",
      demasiadosUsuarios: "Há usuários demais para verificar quem criou o sistema, então por segurança ninguém é removido.",
      ultimoAdmin: "Você não pode remover o último administrador: o sistema ficaria sem ninguém para administrá-lo.",
      noSePudoQuitar: "Não foi possível remover essa pessoa.",
      rolInvalido: "Esse papel não existe neste sistema.",
      rolNoAplicado:
        "Não conseguimos atribuir o papel a essa pessoa. Tente de novo.",
      planRequerido:
        "No plano grátis só o dono entra. Para adicionar pessoas, o dono ativa um plano no TeuSistema.",
      cupoSinVerificar:
        "Não consegui verificar o plano do sistema. Tente de novo daqui a pouco.",
    },
    errores: {
      rateLimit:
        "O limite de e-mails deste momento foi atingido. Gere um link de convite e envie você mesmo, ou aguarde alguns minutos.",
      rateLimitRegistro:
        "Há muitos cadastros ao mesmo tempo. Aguarde alguns minutos e tente de novo — seus dados estão certos.",
      yaRegistrado: "Já existe um usuário cadastrado com esse e-mail.",
      emailInvalido: "O e-mail informado não é válido.",
      invitacionGenerico:
        "Não foi possível enviar o convite. Confira o painel do Supabase para mais detalhes.",
      passwordDebil:
        "A senha precisa ter pelo menos 8 caracteres, com letras e números, e não pode ser uma senha vazada.",
      passwordFiltrada:
        "Essa senha apareceu em vazamentos públicos. Escolha outra que você não use em outros sites.",
      credencialesInvalidas:
        "E-mail ou senha incorretos. Se você errou várias vezes seguidas, aguarde alguns minutos antes de tentar novamente.",
      loginGenerico: "Não foi possível entrar. Tente de novo.",
      emailSinConfirmar:
        "Você ainda não confirmou seu e-mail. Procure o e-mail de confirmação que enviamos (confira também a caixa de spam) e abra o link.",
      passwordIgual: "A senha nova precisa ser diferente da anterior.",
    },
  },
};
/** El pack del idioma del negocio. Todo texto visible del login sale de acá. */
export const at = packDeTextos(AUTH_COPY);
