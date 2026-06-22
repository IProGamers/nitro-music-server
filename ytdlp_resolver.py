#!/usr/bin/env python3
"""
Persistent YouTube audio-URL resolver.

The Bun server spawns this once and talks to it over stdin/stdout (one video id
per line in, one JSON object per line out). Keeping a single warm YoutubeDL
instance avoids the ~1-2s process/startup cost on every request and reuses the
cached player JS, so resolutions after the first are ~0.5-1s instead of ~2-5s.

The android player_client returns full, unthrottled, seekable URLs (no PoToken).
"""
import sys
import json

try:
    from yt_dlp import YoutubeDL
except Exception as e:  # yt_dlp not installed
    sys.stdout.write(json.dumps({"fatal": f"yt_dlp import failed: {e}"}) + "\n")
    sys.stdout.flush()
    sys.exit(1)

def _make(clients):
    return YoutubeDL({
        "format": "bestaudio[ext=m4a]/bestaudio/best",
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "cachedir": False,
        # Force IPv4 (== yt-dlp --force-ipv4): the HF container's IPv6 egress is
        # broken, and YouTube/googlevideo have AAAA records, so IPv6 attempts reset.
        "source_address": "0.0.0.0",
        "extractor_args": {"youtube": {"player_client": clients}},
    })

# Primary = android (fast, unthrottled). Fallback = other clients, used only if
# android is blocked/changed — keeps us working longer through YouTube changes.
_PRIMARY = _make(["android"])
_FALLBACK = _make(["ios", "tv", "web_safari", "web"])


def _extract(ydl, video_id: str) -> str:
    info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
    url = info.get("url")
    if not url:
        for fmt in (info.get("requested_formats") or info.get("formats") or []):
            if fmt.get("acodec") != "none" and fmt.get("url"):
                url = fmt["url"]
                break
    return url or ""


def resolve(video_id: str) -> str:
    try:
        url = _extract(_PRIMARY, video_id)
        if url:
            return url
    except Exception:
        pass
    # android failed/blocked — try the broader client set.
    return _extract(_FALLBACK, video_id)


def main() -> None:
    # Signal readiness so the parent knows the warm instance is up.
    sys.stdout.write(json.dumps({"ready": True}) + "\n")
    sys.stdout.flush()
    for line in sys.stdin:
        vid = line.strip()
        if not vid:
            continue
        try:
            url = resolve(vid)
            sys.stdout.write(json.dumps({"id": vid, "url": url}) + "\n")
        except Exception as e:  # noqa: BLE001 — report any failure, keep serving
            sys.stdout.write(json.dumps({"id": vid, "error": str(e)[:160]}) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
