import { maxInitData } from './api.js';

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
}

start().catch(() => {
  const root = document.getElementById('root');
  root.textContent = 'Не получилось загрузить приложение. Обнови страницу.';
});
