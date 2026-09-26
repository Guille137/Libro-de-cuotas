const el = id => document.getElementById(id);
export function authError(error) {
  const messages = {
    'auth/invalid-credential': 'El correo o la contraseña no coinciden.',
    'auth/user-not-found': 'El correo o la contraseña no coinciden.',
    'auth/wrong-password': 'El correo o la contraseña no coinciden.',
    'auth/invalid-email': 'Revisá el formato del correo.',
    'auth/email-already-in-use': 'No se pudo crear la cuenta. Probá iniciar sesión o recuperar tu contraseña.',
    'auth/weak-password': 'Elegí una contraseña más segura, de al menos 8 caracteres.',
    'auth/password-does-not-meet-requirements': 'La contraseña no cumple los requisitos de seguridad de la cuenta.',
    'auth/too-many-requests': 'Hubo varios intentos. Esperá unos minutos y volvé a probar.',
    'auth/network-request-failed': 'No hay conexión. Revisá Internet y volvé a intentar.',
    'auth/popup-closed-by-user': 'Se cerró la ventana de Google. Podés volver a intentar.',
    'auth/popup-blocked': 'Permití la ventana emergente para entrar con Google.',
    'auth/operation-not-allowed': 'Este método de acceso todavía no está habilitado.',
    'auth/unauthorized-domain': 'Este dominio todavía no está autorizado para iniciar sesión.',
  };
  return messages[error.code] ?? 'No se pudo completar el acceso. Volvé a intentar en unos instantes.';
}

export function setupAccess({ getClient, onAuthenticated, onLocal }) {
  let mode = 'login', working = false;
  function message(text = '', error = false) {
    el('accessMessage').textContent = text;
    el('accessMessage').classList.toggle('form-error', error);
  }
  function setMode(next) {
    mode = next;
    const verify = mode === 'verify', reset = mode === 'reset';
    el('accessTitle').textContent = verify ? 'Verificá tu correo' : reset ? 'Recuperar acceso' : mode === 'register' ? 'Creá tu cuenta' : 'Entrá a tu libro';
    el('accessForm').hidden = verify;
    el('verificationActions').hidden = !verify;
    el('passwordField').hidden = reset;
    el('accessPassword').required = !reset;
    el('accessPassword').disabled = reset;
    el('accessPassword').minLength = mode === 'register' ? 8 : 1;
    el('accessPassword').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    el('passwordHelp').hidden = mode !== 'register';
    el('accessSubmit').textContent = reset ? 'Enviar enlace' : mode === 'register' ? 'Crear cuenta' : 'Iniciar sesión';
    el('accessSwitch').textContent = mode === 'login' ? 'Crear una cuenta' : 'Ya tengo cuenta';
    el('accessReset').hidden = mode !== 'login';
    el('accessGoogle').hidden = verify || reset;
    el('accessPassword').value = '';
    message(verify ? 'Abrí el enlace que recibiste por correo. Después, volvé y pulsá «Ya lo verifiqué».' : '');
  }
  function open(next = 'login') {
    setMode(next);
    if (!el('accessDialog').open) el('accessDialog').showModal();
    (next === 'verify' ? el('checkVerification') : el('accessEmail')).focus();
  }
  async function accept(user) {
    if (!user.emailVerified) { open('verify'); return; }
    await onAuthenticated(user);
    el('accessPassword').value = '';
    el('accessDialog').close();
    document.getElementById('bookTitle')?.focus({ preventScroll: true });
  }
  async function perform(operation) {
    if (working) return;
    working = true;
    const controls = [...document.querySelectorAll('#entryActions button, #accessDialog button, #accessDialog input')].map(node => [node, node.disabled]);
    controls.forEach(([node]) => { node.disabled = true; });
    el('accessDialog').setAttribute('aria-busy', 'true');
    message('Un momento…');
    try {
      if (!getClient()) throw new Error('Firebase no disponible');
      await operation();
    } catch (error) {
      if (!el('accessDialog').open) open();
      if (getClient()?.auth.currentUser && !getClient().auth.currentUser.emailVerified) setMode('verify');
      message(authError(error), true);
    } finally {
      working = false;
      controls.forEach(([node, disabled]) => { node.disabled = disabled; });
      el('accessPassword').disabled = mode === 'reset';
      el('accessDialog').removeAttribute('aria-busy');
      if (el('accessDialog').open) (mode === 'verify' ? el('checkVerification') : el('accessEmail')).focus();
    }
  }
  el('entryEmail').addEventListener('click', () => open(getClient()?.auth.currentUser && !getClient().auth.currentUser.emailVerified ? 'verify' : 'login'));
  el('entryGoogle').addEventListener('click', () => perform(async () => accept(await getClient().login())));
  el('accessGoogle').addEventListener('click', () => perform(async () => accept(await getClient().login())));
  el('entryLocal').addEventListener('click', onLocal);
  el('accessSwitch').addEventListener('click', () => { setMode(mode === 'login' ? 'register' : 'login'); el('accessEmail').focus(); });
  el('accessReset').addEventListener('click', () => { setMode('reset'); el('accessEmail').focus(); });
  el('accessClose').addEventListener('click', () => el('accessDialog').close());
  el('accessDialog').addEventListener('cancel', event => { if (working) event.preventDefault(); });
  el('accessDialog').addEventListener('close', () => { el('accessPassword').value = ''; });
  el('accessForm').addEventListener('submit', event => {
    event.preventDefault();
    const email = el('accessEmail').value.trim(), password = el('accessPassword').value;
    void perform(async () => {
      if (mode === 'reset') {
        try { await getClient().resetPassword(email); }
        catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
        message('Si existe una cuenta para ese correo, recibirás un enlace para recuperar el acceso.');
      } else await accept(await (mode === 'register' ? getClient().register(email, password) : getClient().loginEmail(email, password)));
    });
  });
  el('checkVerification').addEventListener('click', () => perform(async () => {
    const user = await getClient().refreshUser();
    if (!user.emailVerified) { message('El correo todavía no está verificado. Revisá también la carpeta de spam.'); return; }
    await accept(user);
  }));
  el('resendVerification').addEventListener('click', () => perform(async () => { await getClient().resendVerification(); message('Enlace enviado. Revisá tu correo y la carpeta de spam.'); }));
  el('changeAccount').addEventListener('click', () => perform(async () => { await getClient().logout(); setMode('login'); }));
  return { open };
}
