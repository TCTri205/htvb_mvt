from pathlib import Path
path = Path('backend/workflow/services/rbac.py')
start = None
for lineno, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
    if 'ACT_COLUMN_MAP' in line:
        start = lineno
        break
print('ACT column map start line', start)
