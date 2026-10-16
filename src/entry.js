import { maxInitData } from './api.js';

const startupRetryKey = 'helpi-startup-asset-retry';

async function start() {
  // Ordinary browsers do not depend on the availability of the MAX CDN.
  if (maxInitData() && !window.WebApp?.ready) {
    await new Promise(resolve => {
      const script = document.createElement('script');
      const timeout = setTimeout(resolve, 8000);
      const done = () => { clearTimeout(timeout); resolve(); };
      script.src = 'https://st.max.ru/js/max-web-app.js';
      script.onload = done;
      script.onerror = done;
      document.head.append(script);
    });
  }
  await import('./main.jsx');
  try { sessionStorage.removeItem(startupRetryKey); } catch {}
  const currentUrl = new URL(window.location.href);
  if (currentUrl.searchParams.has('_asset_retry')) {
    currentUrl.searchParams.delete('_asset_retry');
    window.history.replaceState(window.history.state, '', currentUrl.href);
  }
}

start().catch((error) => {
  console.error('Не удалось загрузить клиентское приложение:', error);
  const message = String(error?.message || error);
  const isAssetLoadFailure = /fetch|import|module|preload|stylesheet|network/i.test(message);
  let alreadyRetried = new URLSearchParams(window.location.search).get('_asset_retry') === '1';
  try { alreadyRetried ||= sessionStorage.getItem(startupRetryKey) === '1'; } catch {}
  if (isAssetLoadFailure && !alreadyRetried) {
    try { sessionStorage.setItem(startupRetryKey, '1'); } catch {}
    try {
      const retryUrl = new URL(window.location.href);
      retryUrl.searchParams.set('_asset_retry', '1');
      window.location.replace(retryUrl.href);
      return;
    } catch {}
  }
  try { sessionStorage.removeItem(startupRetryKey); } catch {}
  const root = document.getElementById('root');
  root.textContent = 'Не получилось загрузить приложение. Обнови страницу.';
});
