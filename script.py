from pathlib import Path
from typing import Optional, Dict, Any

path = Path('backend/cases/serializers.py')
text = path.read_text(encoding='utf-8')
if 'def _user_display_name' not in text:
    marker = '# ========================='
    idx = text.index(marker) if marker in text else -1
    if idx != -1:
        insert = ("def _user_display_name(user) -> Optional[str]:\n    if not user:\n        return None\n    return getattr(user, "full_name", None) or getattr(user, "username", None)\n\n\n")
        text = text[:idx] + insert + text[idx:]
start = text.index('class CaseSlimSerializer')
end = text.index('class CaseDetailSerializer')
new_class = """class CaseSlimSerializer(serializers.ModelSerializer):
