# core/management/commands/export_openapi.py
from __future__ import annotations

from pathlib import Path
from django.core.management.base import BaseCommand, CommandParser
from django.core.management import call_command


class Command(BaseCommand):
    help = "Export OpenAPI schema (drf-spectacular) to a file (YAML/JSON), optionally export both."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--out",
            default="./openapi.yaml",
            help=(
                "Đường dẫn file đầu ra. Mặc định: ./openapi.yaml. "
                "Nếu --format=auto, phần mở rộng sẽ quyết định định dạng (.yaml/.yml hoặc .json)."
            ),
        )
        parser.add_argument(
            "--format",
            choices=["yaml", "json", "auto"],
            default="auto",
            help="Định dạng schema chính. 'auto' suy ra từ phần mở rộng của --out.",
        )
        parser.add_argument(
            "--json",
            action="store_true",
            help="Xuất thêm file JSON ở cùng thư mục (cùng tên, đuôi .json).",
        )

    def handle(self, *args, **opts):
        out = Path(opts["out"]).resolve()
        out.parent.mkdir(parents=True, exist_ok=True)

        fmt_opt: str = opts["format"].lower()

        # Suy ra định dạng chính từ --format hoặc phần mở rộng tệp (--format=auto)
        if fmt_opt == "auto":
            suffix = out.suffix.lower()
            if suffix == ".json":
                primary_fmt = "json"
            else:
                # Mặc định yaml nếu không phải .json (hỗ trợ .yaml/.yml và các đuôi khác)
                primary_fmt = "yaml"
        else:
            primary_fmt = fmt_opt

        # Map sang giá trị hợp lệ của drf-spectacular:
        #  - YAML  -> "openapi"
        #  - JSON  -> "openapi-json"
        def _spectacular_fmt(fmt: str) -> str:
            if fmt == "json":
                return "openapi-json"
            # mặc định dùng openapi (YAML)
            return "openapi"

        spectacular_format = _spectacular_fmt(primary_fmt)

        # Ghi file chính theo định dạng đã chọn
        call_command("spectacular", file=str(out), format=spectacular_format)
        self.stdout.write(self.style.SUCCESS(f"Wrote {out} ({primary_fmt})"))

        # Nếu cần xuất thêm JSON và định dạng chính không phải JSON
        if opts.get("json", False) and primary_fmt != "json":
            json_path = out.with_suffix(".json")
            call_command("spectacular", file=str(json_path), format=_spectacular_fmt("json"))
            self.stdout.write(self.style.SUCCESS(f"Wrote {json_path} (json)"))
