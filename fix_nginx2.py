"""
Fix the leadscan blocks in the nginx.conf where $ variables were stripped.
Uses direct string replacement - no regex.
"""

conf = open('/opt/aion/infra/edge/nginx.conf').read()

fixes = [
    # try_files lost $uri $uri/
    ('            try_files  / /leadscan/index.html;',
     '            try_files $uri $uri/ /leadscan/index.html;'),
    # rewrite lost $1
    ('            rewrite ^/leadscan/api/(.*)$ / break;',
     '            rewrite ^/leadscan/api/(.*)$ /$1 break;'),
    # proxy_set_header Host lost $host
    ('            proxy_set_header Host ;\n            proxy_set_header X-Real-IP ;',
     '            proxy_set_header Host $host;\n            proxy_set_header X-Real-IP $remote_addr;'),
    # proxy_set_header X-Forwarded-For lost $proxy_add_x_forwarded_for
    ('            proxy_set_header X-Forwarded-For ;',
     '            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;'),
    # if condition lost $request_method
    ('            if ( = OPTIONS) { return 204; }',
     '            if ($request_method = OPTIONS) { return 204; }'),
]

for old, new in fixes:
    count = conf.count(old)
    if count > 0:
        conf = conf.replace(old, new)
        print(f'  Fixed {count}x: {old.strip()[:60]}')
    else:
        print(f'  Skip (not found): {old.strip()[:60]}')

open('/opt/aion/infra/edge/nginx.conf', 'w').write(conf)
print('Done')
