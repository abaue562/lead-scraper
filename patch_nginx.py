import sys

conf = open('/opt/aion/infra/edge/nginx.conf').read()
snippet = open('/tmp/leadscan_snippet.conf').read()

marker = '        location / {\n            set $backend_ui'
if marker not in conf:
    print('MARKER NOT FOUND', file=sys.stderr)
    sys.exit(1)

idx = conf.index(marker)
https_start = conf.rfind('listen 443 ssl', 0, idx)
https_section = conf[https_start:idx]
if '/leadscan/' in https_section:
    print('Already patched in HTTPS block')
    sys.exit(0)

patched = conf[:idx] + snippet + conf[idx:]
open('/opt/aion/infra/edge/nginx.conf', 'w').write(patched)
print('Done - leadscan added to HTTPS block')
