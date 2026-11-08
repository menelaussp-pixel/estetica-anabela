// =====================================================================
// Painel da dona — ativar avisos de marcações neste dispositivo (Web Push)
// =====================================================================

const pushSuportado = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function chaveParaBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
}

async function subscricaoAtual() {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

function guardarSubscricao(sub) {
  const { endpoint, keys } = sub.toJSON();
  return sb.from('push_subscricoes')
    .upsert({ endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: 'endpoint' });
}

async function atualizarBotaoPush() {
  const btn = $('btnPush');
  if (!pushSuportado) {
    btn.disabled = true;
    aviso($('avisoPush'), 'Este navegador não permite notificações.', 'info');
    return;
  }
  if (Notification.permission === 'denied') {
    btn.disabled = true;
    aviso($('avisoPush'), 'As notificações estão bloqueadas. Autorize-as nas definições do navegador para este site.', 'info');
    return;
  }
  btn.disabled = false;
  btn.textContent = (await subscricaoAtual()) ? 'Desativar notificações' : 'Ativar notificações';
}

// Ao abrir o painel, volta a registar a subscrição caso o navegador a tenha renovado.
async function sincronizarPush() {
  if (!pushSuportado) return;
  const sub = await subscricaoAtual();
  if (sub) await guardarSubscricao(sub);
  atualizarBotaoPush();
}

async function ativarPush() {
  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') {
    aviso($('avisoPush'), 'É preciso autorizar as notificações para as receber neste dispositivo.');
    return;
  }
  const reg = await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: chaveParaBytes(window.CONFIG.VAPID_PUBLICA),
  });
  const { error } = await guardarSubscricao(sub);
  if (error) {
    await sub.unsubscribe();
    throw error;
  }
  aviso($('avisoPush'), 'Notificações ativadas neste dispositivo.', 'ok');
}

async function desativarPush(sub) {
  const { error } = await sb.from('push_subscricoes').delete().eq('endpoint', sub.endpoint);
  if (error) throw error;
  await sub.unsubscribe();
  aviso($('avisoPush'), 'Notificações desativadas neste dispositivo.', 'info');
}

$('btnPush').addEventListener('click', async () => {
  const btn = $('btnPush');
  aviso($('avisoPush'), '');
  btn.disabled = true;
  try {
    const sub = await subscricaoAtual();
    if (sub) await desativarPush(sub);
    else await ativarPush();
  } catch {
    aviso($('avisoPush'), 'Não foi possível alterar as notificações. Tente novamente.');
  }
  atualizarBotaoPush();
});
