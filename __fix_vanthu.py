from pathlib import Path
path = Path('vanthu.js')
text = path.read_text(encoding='utf-8')
needle = '.join("\n");'
replacement = '.join("\\n");'
if needle not in text:
    raise SystemExit('needle not found')
text = text.replace(needle, replacement, 1)
path.write_text(text, encoding='utf-8')
