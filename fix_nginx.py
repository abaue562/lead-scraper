import re, sys

conf = open('/opt/aion/infra/edge/nginx.conf').read()
snippet = open('/tmp/leadscan_snippet.conf').read()

# Remove ALL existing leadscan location blocks (both good and bad ones)
# Match: optional comment line + location /leadscan block
conf = re.sub(
    r'        # [^\n]*[Ll]ead[Ss]can[^\n]*\n        location /leadscan[^}]+}\n',
    '',
    conf
)
conf = re.sub(
    r'        location /leadscan[^}]+}\n',
    '',
    conf
)

# Also remove == LeadScan == style comments
conf = re.sub(r'        # == LeadScan[^\n]*\n', '', conf)

print('Removed existing leadscan blocks')

# Find the HTTPS backend_ui location and insert snippet before it
marker = '        location / {\n            set $backend_ui'
if marker not in conf:
    print('MARKER NOT FOUND', file=sys.stderr)
    sys.exit(1)

idx = conf.index(marker)
patched = conf[:idx] + snippet + '\n' + conf[idx:]
open('/opt/aion/infra/edge/nginx.conf', 'w').write(patched)
print('Done - clean leadscan blocks inserted into HTTPS server block')
