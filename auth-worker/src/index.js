const CALLBACK_PATH = '/callback';
const STATE_PATTERN = /^(\d{4,5})\.([a-f0-9]{32})$/;

function response(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const callbackUrl = `${url.origin}${CALLBACK_PATH}`;
    if (url.pathname === '/start' && request.method === 'GET') {
      const state = url.searchParams.get('state') || '';
      const match = STATE_PATTERN.exec(state);
      if (!match || Number(match[1]) > 65535) return response('Geçersiz oturum durumu.', 400);
      if (!env.GITHUB_CLIENT_ID) return response('GitHub Client ID ayarlanmamış.', 503);
      const authorize = new URL('https://github.com/login/oauth/authorize');
      authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
      authorize.searchParams.set('redirect_uri', callbackUrl);
      authorize.searchParams.set('state', state);
      authorize.searchParams.set('prompt', 'select_account');
      return Response.redirect(authorize, 302);
    }
    if (url.pathname === CALLBACK_PATH && request.method === 'GET') {
      const state = url.searchParams.get('state') || '';
      const match = STATE_PATTERN.exec(state);
      if (!match || Number(match[1]) > 65535) return response('Geçersiz oturum durumu.', 400);
      const local = new URL(`http://127.0.0.1:${match[1]}/callback`);
      for (const key of ['state', 'code', 'error', 'error_description']) {
        if (url.searchParams.has(key)) local.searchParams.set(key, url.searchParams.get(key));
      }
      return Response.redirect(local, 302);
    }
    if ((url.pathname === '/exchange' || url.pathname === '/refresh') && request.method === 'POST') {
      if (request.headers.has('Origin')) return response('Tarayıcı erişimi kapalı.', 403);
      if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return response('GitHub kimlik bilgileri eksik.', 503);
      if (Number(request.headers.get('Content-Length') || 0) > 1024) return response('İstek çok büyük.', 413);
      let payload;
      try { payload = await request.json(); } catch { return response('Geçersiz JSON.', 400); }
      const refreshing = url.pathname === '/refresh';
      const credential = refreshing ? payload?.refresh_token : payload?.code;
      if (!/^[A-Za-z0-9_-]{1,256}$/.test(credential || '')) return response('Geçersiz GitHub kimliği.', 400);
      const form = { client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET };
      if (refreshing) { form.grant_type = 'refresh_token'; form.refresh_token = credential; }
      else { form.code = credential; form.redirect_uri = callbackUrl; }
      const github = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(form),
      });
      const body = await github.text();
      return response(body, github.status, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    return response('STARDROP auth worker', 404);
  },
};
