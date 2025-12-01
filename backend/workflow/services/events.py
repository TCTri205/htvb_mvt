# workflow/services/events.py
from __future__ import annotations

import atexit
import os
import time
import json
from typing import Any, Mapping, Optional, Dict
from django.conf import settings

try:
    import orjson  # tối ưu tốc độ nếu có
    def _dumps(obj: Any) -> str:
        return orjson.dumps(obj).decode("utf-8")
except Exception:
    def _dumps(obj: Any) -> str:
        return json.dumps(obj, ensure_ascii=False)

_redis_client = None  # lazy init, cache trong process


def _close_redis_client():
    global _redis_client
    client = _redis_client
    _redis_client = None
    if client is None or not hasattr(client, "close"):
        return
    try:
        client.close()
    except Exception:
        pass


atexit.register(_close_redis_client)


def _now_ms() -> int:
    return int(time.time() * 1000)


def get_effective_redis_url() -> str:
    """
    Lấy URL Redis đang dùng cho events:
    - Ưu tiên settings.EVENTS_REDIS_URL
    - Sau đó settings.REDIS_URL
    - Sau đó env REDIS_URL
    - Cuối cùng fallback: 127.0.0.1:6379/0 (tránh 'localhost' trên Windows)
    """
    url: Optional[str] = (
        getattr(settings, "EVENTS_REDIS_URL", None)
        or getattr(settings, "REDIS_URL", None)
        or os.environ.get("REDIS_URL")
    )
    if url:
        return url

    host = getattr(settings, "REDIS_HOST", "127.0.0.1")
    port = getattr(settings, "REDIS_PORT", 6379)
    db = getattr(settings, "REDIS_DB", 0)
    return f"redis://{host}:{port}/{db}"


def _get_redis():
    """
    Lazy-init Redis client. Trả về None nếu chưa cài redis-py
    hoặc URL lỗi. Không raise để tránh làm hỏng luồng Service.
    """
    global _redis_client
    if _redis_client is not None:
        return _redis_client

    try:
        import redis  # type: ignore
    except Exception:
        _redis_client = None
        if getattr(settings, "DEBUG", False):
            print("[events] redis-py chưa được cài. pip install redis")
        return None

    url = get_effective_redis_url()
    try:
        _redis_client = redis.Redis.from_url(url, decode_responses=True)
        # ping thử, nếu fail vẫn giữ client để lần sau thử lại
        try:
            _redis_client.ping()
            if getattr(settings, "DEBUG", False):
                print(f"[events] Connected Redis OK: {url}")
        except Exception as e:
            if getattr(settings, "DEBUG", False):
                print(f"[events] Redis ping fail ({url}): {e}")
    except Exception as e:
        _redis_client = None
        if getattr(settings, "DEBUG", False):
            print(f"[events] Tạo Redis client thất bại ({url}): {e}")
    return _redis_client


def emit(
    event: str,
    payload: Optional[Mapping[str, Any]] = None,
    *,
    audience: Optional[Mapping[str, Any]] = None,  # ví dụ: {"user_ids":[...], "department_ids":[...]}
    actor: Any = None,  # có thể truyền request.user
) -> bool:
    """
    Publish sự kiện realtime qua Redis Pub/Sub.

    - event: "doc_out.published" -> publish lên các channel:
        "events", "events.doc_out", "events.doc_out.published"
    - payload: dữ liệu tuỳ ý, phải JSON-serializable
    - audience: gợi ý lọc người nhận cho consumer (UI/WebSocket) nếu cần
    - actor: user/ID; sẽ nhúng actor_id vào envelope nếu có

    Trả về:
      True  = ít nhất publish được 1 channel
      False = Redis không cấu hình/không có -> no-op an toàn
    """
    # Cho phép tắt publish ở môi trường test/dev
    if getattr(settings, "EVENTS_PUBLISH_ENABLED", True) is False:
        if getattr(settings, "DEBUG", False):
            print("[events.emit] disabled by EVENTS_PUBLISH_ENABLED=False")
        return False

    client = _get_redis()
    envelope: Dict[str, Any] = {
        "event": event,
        "payload": dict(payload or {}),
        "audience": dict(audience or {}),
        "ts": _now_ms(),
    }
    if actor is not None:
        actor_id = getattr(actor, "user_id", None) or getattr(actor, "pk", None)
        if actor_id is not None:
            envelope["actor_id"] = str(actor_id)

    msg = _dumps(envelope)

    if client is None:
        if getattr(settings, "DEBUG", False):
            print("[events.emit] no redis client; skipping")
        return False

    ok = False
    channels = ["events"]
    # event = "a.b.c" -> publish dần: events, events.a, events.a.b, events.a.b.c
    prefix = "events"
    for part in event.split("."):
        prefix = f"{prefix}.{part}"
        channels.append(prefix)

    for ch in channels:
        try:
            # publish() trả số subscriber trên channel đó (int)
            subs = client.publish(ch, msg)
            ok = ok or (subs is not None)  # coi là sent nếu không exception
            if getattr(settings, "DEBUG", False):
                print(f"[events.emit] PUBLISH {ch} subs={subs}")
        except Exception as e:
            if getattr(settings, "DEBUG", False):
                print(f"[events.emit] publish fail {ch}: {e}")
            continue

    if getattr(settings, "DEBUG", False):
        print(f"[events.emit] event={event} sent={ok} channels={channels} msg={msg}")
    return ok
