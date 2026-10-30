#!/usr/bin/env python3
"""Read-only snapshot of the LIVE Tilda project into tilda/live/.

Uses the official Tilda MCP server (https://tilda.cc/api/mcp/). It only calls getters,
it never writes to Tilda. The key is read from the TILDA_MCP_TOKEN env var, or from
the "tilda" entry of ~/.claude.json (mcpServers.tilda.headers.Authorization).
The key is never printed or saved.

Usage:  python3 tilda/tools/export_live.py [--page ALIAS_OR_ID ...]
Output layout is described in tilda/live/README.md.
"""
import json, os, re, shutil, sys, time, urllib.error, urllib.request

PROJECT_ID = 21353796
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'live')
PROTO = '2025-06-18'


def load_conn():
    tok = os.environ.get('TILDA_MCP_TOKEN')
    url = 'https://tilda.cc/api/mcp/'
    if tok:
        return url, 'Bearer ' + tok.replace('Bearer ', '')
    cfg = json.load(open(os.path.expanduser('~/.claude.json')))['mcpServers']['tilda']
    return cfg['url'], cfg['headers']['Authorization']


URL, AUTH = load_conn()
SID = None


def rpc(body):
    h = {'Authorization': AUTH, 'Content-Type': 'application/json',
         'Accept': 'application/json, text/event-stream', 'MCP-Protocol-Version': PROTO}
    if SID:
        h['Mcp-Session-Id'] = SID
    req = urllib.request.Request(URL, json.dumps(body).encode(), h)
    for attempt in range(4):
        try:
            r = urllib.request.urlopen(req, timeout=60)
            txt = r.read().decode()
            data = [l[5:] for l in txt.splitlines() if l.startswith('data:')]
            return r.headers.get('Mcp-Session-Id'), json.loads(data[-1] if data else txt or 'null')
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503) and attempt < 3:
                time.sleep(2 * (attempt + 1)); continue
            return None, {'error': {'message': 'HTTP %s %s' % (e.code, e.read().decode()[:300])}}
        except Exception as e:  # network hiccup
            if attempt == 3:
                return None, {'error': {'message': str(e)}}
            time.sleep(2)


def start():
    global SID
    SID, _ = rpc({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {
        'protocolVersion': PROTO, 'capabilities': {}, 'clientInfo': {'name': 'narin-export', 'version': '1'}}})
    rpc({'jsonrpc': '2.0', 'method': 'notifications/initialized'})


def call(name, args=None):
    """Returns parsed JSON (or text) of a tool result, or None on error."""
    _, r = rpc({'jsonrpc': '2.0', 'id': 3, 'method': 'tools/call', 'params': {'name': name, 'arguments': args or {}}})
    if not r or 'error' in r or r.get('result', {}).get('isError'):
        return None
    txt = ''.join(c.get('text', '') for c in r['result'].get('content', []))
    try:
        return json.loads(txt)
    except ValueError:
        return txt


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text if text.endswith('\n') else text + '\n')


def slug(p):
    a = (p.get('alias') or '').strip('/')
    return (a or 'page' + p['id']).replace('/', '_')


# tplid -> short name, only for the ones we meet on this site
TPL = {131: 'T123-html', 396: 'zero', 706: 'cart', 1002: 'store-grid', 1093: 'menu-or-header',
       215: 'text', 3: 'cover', 786: 'x786', 585: 'x585', 270: 'anchor'}


def main():
    only = set(a for a in sys.argv[1:] if not a.startswith('--'))
    start()
    pages = call('get_pages', {'projectid': PROJECT_ID})
    if not isinstance(pages, list):
        sys.exit('cannot read pages (check the key)')
    pages = [p for p in pages if not p.get('trash')]
    if not only:
        shutil.rmtree(os.path.join(OUT, 'pages'), ignore_errors=True)
    head = call('get_head_code', {'projectid': PROJECT_ID})
    if isinstance(head, dict):
        write(os.path.join(OUT, 'site', 'head.html'), head.get('project', {}).get('headcode', ''))
    css = call('get_project_css_code', {'projectid': PROJECT_ID})
    if css:
        write(os.path.join(OUT, 'site', 'custom.css'), css if isinstance(css, str) else json.dumps(css, indent=1, ensure_ascii=False))
    # NEVER add get_payment_integrations (returns the live Stripe secret key and webhook
    # secret in clear text) or get_promocodes (the codes themselves are secrets) here.
    for tool, fname in (('get_redirect_301s', 'redirects.json'), ('get_robots_txt', 'robots.json'),
                        ('get_delivery_integrations', 'delivery.json')):
        d = call(tool, {'projectid': PROJECT_ID})
        if d is not None and not only:
            write(os.path.join(OUT, 'site', fname), json.dumps(d, indent=1, ensure_ascii=False))
    index = []
    nrec = 0
    for p in pages:
        s = slug(p)
        if only and s not in only and p['id'] not in only:
            continue
        recs = call('get_page_records', {'projectid': PROJECT_ID, 'pageid': int(p['id'])})
        if not isinstance(recs, list):
            print('  !! cannot read records of', s)
            recs = []
        pg = call('get_head_code', {'projectid': PROJECT_ID, 'pageid': int(p['id'])})
        ph = pg.get('page', {}).get('headcode', '') if isinstance(pg, dict) else ''
        base = os.path.join(OUT, 'pages', s)
        if ph:
            write(os.path.join(base, 'head.html'), ph)
        rows = []
        for i, r in enumerate(recs, 1):
            rid, tpl = r['recordid'], int(r['tplid'])
            row = {'n': i, 'recordid': rid, 'tplid': tpl, 'kind': TPL.get(tpl, 'tpl%d' % tpl)}
            if tpl == 131:
                e = call('edit_record', {'projectid': PROJECT_ID, 'pageid': int(p['id']), 'recordid': rid, 'tab': 'content'})
                code = (e or {}).get('record', {}).get('code', '') if isinstance(e, dict) else ''
                fn = '%02d-rec%s.html' % (i, rid)
                write(os.path.join(base, 'blocks', fn), code)
                row['file'] = 'blocks/' + fn
                row['bytes'] = len(code.encode('utf-8'))
            elif tpl in (706, 1002):
                e = call('edit_record', {'projectid': PROJECT_ID, 'pageid': int(p['id']), 'recordid': rid, 'tab': 'content'})
                if isinstance(e, dict):
                    fn = '%02d-rec%s.json' % (i, rid)
                    write(os.path.join(base, 'blocks', fn), json.dumps(e.get('record', e), indent=1, ensure_ascii=False))
                    row['file'] = 'blocks/' + fn
            rows.append(row)
            nrec += 1
        meta = {k: p.get(k) for k in ('id', 'title', 'url', 'alias', 'published', 'changed', 'folderid', 'viewpassword')}
        meta['viewpassword'] = bool(meta.get('viewpassword'))
        meta['records'] = rows
        write(os.path.join(base, 'page.json'), json.dumps(meta, indent=1, ensure_ascii=False))
        index.append({'slug': s, 'id': p['id'], 'title': p.get('title'), 'public_url': p.get('alias') or p.get('url'),
                      'blocks': len(rows), 'html_blocks': sum(1 for r in rows if r['tplid'] == 131)})
        print('%-28s %2d blocks (%d html)' % (s, len(rows), index[-1]['html_blocks']))
    if not only:
        write(os.path.join(OUT, 'index.json'), json.dumps({'projectid': PROJECT_ID, 'pages': index}, indent=1, ensure_ascii=False))
    print('done:', len(index), 'pages,', nrec, 'blocks ->', os.path.relpath(OUT))


if __name__ == '__main__':
    main()
