from __future__ import annotations

import re
from html.parser import HTMLParser
from pathlib import Path
from pprint import pformat


BASE_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = BASE_DIR.parent / "frontend"
TEMPLATE_DIR = BASE_DIR / "templates"

MODULES = ["vanthu", "lanhdao", "quantri", "chuyenvien"]
EXCLUDE_SCRIPTS = {"js/api.js", "js/layout.js"}


class ScriptCollector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() != "script":
            return
        attr_pairs = [(name.lower(), value) for name, value in attrs]
        attr_dict = dict(attr_pairs)
        src = attr_dict.get("src")
        if not src:
            return

        normalized = self._normalize_src(src)
        if normalized in EXCLUDE_SCRIPTS:
            return

        other_attrs = []
        for name, value in attr_pairs:
            if name == "src":
                continue
            if value is None:
                other_attrs.append(name)
            else:
                other_attrs.append(f'{name}="{value}"')

        attr_text = ""
        if other_attrs:
            attr_text = " " + " ".join(other_attrs)

        self.scripts.append({"src": normalized, "attrs": attr_text})

    @staticmethod
    def _normalize_src(value: str) -> str:
        cleaned = value.replace("\\", "/")
        if "assets/" in cleaned:
            return cleaned.split("assets/", 1)[1]
        return cleaned.lstrip("./")


def extract_title(source: str) -> str:
    match = re.search(r"<title>(.*?)</title>", source, re.S | re.IGNORECASE)
    return match.group(1).strip() if match else "Hệ thống quản lý văn bản"


def extract_body_attrs(source: str) -> dict[str, str]:
    lower = source.lower()
    start = lower.find("<body")
    if start == -1:
        return {}
    end = source.find(">", start)
    tag = source[start:end]
    return dict(re.findall(r'([\w-]+)\s*=\s*"([^"]*)"', tag))


def extract_main_inner(source: str) -> str:
    lower = source.lower()
    start = lower.find("<main")
    if start == -1:
        raise ValueError("No <main> tag found")
    open_end = source.find(">", start)
    close = lower.find("</main>", open_end)
    if close == -1:
        raise ValueError("No closing </main> found")
    return source[open_end + 1 : close].rstrip()


def collect_scripts(source: str) -> list[dict[str, str]]:
    collector = ScriptCollector()
    collector.feed(source)
    return collector.scripts


def write_template(dest: Path, title: str, main_inner: str, scripts: list[dict[str, str]]) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    parts = [
        '{% extends "layout/base.html" %}',
        "{% load static %}",
        "{% block title %}" + title + "{% endblock %}",
        "{% block content %}",
        main_inner,
        "{% endblock %}",
    ]

    if scripts:
        parts.append("{% block extra_js %}")
        for script in scripts:
            parts.append(f'<script src="{{% static \'{script["src"]}\' %}}"{script["attrs"]}></script>')
        parts.append("{% endblock %}")

    dest.write_text("\n".join(parts).strip() + "\n", encoding="utf-8")


def process_file(path: Path, role: str, url_path: str, dest_subdir: str | None = None) -> dict[str, str]:
    raw = path.read_text(encoding="utf-8")
    title = extract_title(raw)
    attrs = extract_body_attrs(raw)
    main_inner = extract_main_inner(raw)
    post_main = raw[raw.lower().find("</main>") + len("</main>") :]
    scripts = collect_scripts(post_main)

    dest_dir = TEMPLATE_DIR / (dest_subdir or role)
    dest = dest_dir / path.name
    write_template(dest, title, main_inner, scripts)

    template_name = str(dest.relative_to(TEMPLATE_DIR)).replace("\\", "/")
    page_slug = attrs.get("data-page") or path.stem
    return {
        "name": f"{role}-{page_slug}",
        "template": template_name,
        "url": url_path,
        "body_role": role,
        "body_page": page_slug,
    }


def build_registry(entries: list[dict[str, str]]) -> None:
    target = BASE_DIR / "ui" / "page_registry.py"
    entries.sort(key=lambda x: x["url"])
    content = [
        "# Auto-generated registry of UI templates. Re-run scripts/generate_ui_templates.py when frontend assets change.",
        "PAGE_REGISTRY = " + pformat(entries, width=120) + "\n",
    ]
    target.write_text("\n".join(content), encoding="utf-8")


def main() -> None:
    registry: list[dict[str, str]] = []

    for module in MODULES:
        module_dir = FRONTEND_DIR / module
        for file in sorted(module_dir.glob("*.html")):
            slug = file.stem
            url = f"{module}/{slug}/"
            entry = process_file(file, module, url)
            registry.append(entry)

    template_file = FRONTEND_DIR / "template.html"
    if template_file.exists():
        entry = process_file(template_file, "template", "template/", dest_subdir="chung")
        registry.append(entry)

    build_registry(registry)


if __name__ == "__main__":
    main()
