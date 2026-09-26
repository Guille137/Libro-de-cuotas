import { byId } from './view.js';

// Confirmaciones dentro de la app: título concreto, consecuencias y foco seguro.
export function confirmAction({ title, description, label = 'Confirmar', danger = false, phrase = '' }) {
  const dialog = byId('confirmDialog');
  byId('confirmTitle').textContent = title;
  byId('confirmDescription').textContent = description;
  byId('confirmAccept').textContent = label;
  byId('confirmAccept').className = danger ? 'danger-button' : 'primary';
  byId('confirmPhraseField').hidden = !phrase;
  byId('confirmPhraseLabel').textContent = phrase ? `Escribí ${phrase} para confirmar` : '';
  byId('confirmPhrase').value = '';
  byId('confirmAccept').disabled = Boolean(phrase);
  byId('confirmPhrase').oninput = () => { byId('confirmAccept').disabled = byId('confirmPhrase').value.trim() !== phrase; };
  dialog.returnValue = '';
  dialog.showModal();
  byId('confirmCancel').focus();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'accept'), { once: true }));
}
