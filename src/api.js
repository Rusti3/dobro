export function maxInitData() {
  if (typeof window.WebApp?.initData === 'string' && window.WebApp.initData) return window.WebApp.initData;
  return new URLSearchParams(window.location.hash.slice(1)).get('WebAppData')
    || new URLSearchParams(window.location.search).get('WebAppData') || '';
}

export async function api(url,method='GET',body) {
  const init=maxInitData();
  const response=await fetch('/api'+url,{
    method, headers:{'Content-Type':'application/json',...(init?{'X-Max-Init-Data':init}:{})},
    ...(body!==undefined?{body:JSON.stringify(body)}:{}),
  });
  const data=await response.json();
  if(!response.ok) throw new Error(data.error||'Не удалось сохранить. Попробуй ещё раз.');
  return data;
}
