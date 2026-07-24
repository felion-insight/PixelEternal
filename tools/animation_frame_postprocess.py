#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pixel Eternal - 精灵动画帧后处理与校验
- 黑/白底边缘 flood 抠透明
- 仅保留最大连通角色区域（剔除多角色/精灵表误生成）
- 按基准帧统一缩放与脚点/中心对齐
"""
from __future__ import annotations

import base64
import io
from collections import deque
from dataclasses import dataclass
from typing import List, Optional, Tuple

try:
    from PIL import Image
except ImportError:
    Image = None  # type: ignore

CHROMA_THRESHOLD = int(__import__("os").environ.get("PE_CHROMA_KEY_THRESHOLD", "18"))
MIN_BLOB_AREA_RATIO = 0.008
MAX_BLOB_COUNT = 1
MAX_AREA_RATIO_DEV = 0.38
MAX_HEIGHT_RATIO_DEV = 0.28
MIN_POSE_DIFF_RATIO = float(__import__("os").environ.get("PE_ANIM_MIN_POSE_DIFF", "0.055"))


@dataclass
class FrameStats:
    bbox: Tuple[int, int, int, int]
    area: int
    foot_y: int
    center_x: float
    blob_count: int


def _ensure_rgba(img: "Image.Image") -> "Image.Image":
    return img.convert("RGBA")


def _is_chroma(r: int, g: int, b: int, threshold: int = CHROMA_THRESHOLD) -> bool:
    if r <= threshold and g <= threshold and b <= threshold:
        return True
    if r >= 255 - threshold and g >= 255 - threshold and b >= 255 - threshold:
        return True
    return False


def chroma_key_transparent(img: "Image.Image", threshold: int = CHROMA_THRESHOLD) -> "Image.Image":
    img = _ensure_rgba(img)
    w, h = img.size
    px = img.load()
    visited = [[False] * w for _ in range(h)]

    def is_bg(x: int, y: int) -> bool:
        r, g, b, a = px[x, y]
        if a < 8:
            return True
        return _is_chroma(r, g, b, threshold)

    q: deque = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not visited[y][x] and is_bg(x, y):
                visited[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not visited[y][x] and is_bg(x, y):
                visited[y][x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx] and is_bg(nx, ny):
                visited[ny][nx] = True
                q.append((nx, ny))
    return img


def _find_blobs(alpha) -> List[Tuple[int, Tuple[int, int, int, int]]]:
    w, h = alpha.size
    data = alpha.load()
    seen = [[False] * w for _ in range(h)]
    blobs: List[Tuple[int, Tuple[int, int, int, int]]] = []
    min_area = max(16, int(w * h * MIN_BLOB_AREA_RATIO))

    for sy in range(h):
        for sx in range(w):
            if seen[sy][sx] or data[sx, sy] < 32:
                continue
            q: deque = deque([(sx, sy)])
            seen[sy][sx] = True
            min_x = max_x = sx
            min_y = max_y = sy
            area = 0
            while q:
                x, y = q.popleft()
                area += 1
                min_x = min(min_x, x)
                max_x = max(max_x, x)
                min_y = min(min_y, y)
                max_y = max(max_y, y)
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and data[nx, ny] >= 32:
                        seen[ny][nx] = True
                        q.append((nx, ny))
            if area >= min_area:
                blobs.append((area, (min_x, min_y, max_x + 1, max_y + 1)))
    blobs.sort(key=lambda x: -x[0])
    return blobs


def extract_largest_character(img: "Image.Image") -> "Image.Image":
    img = _ensure_rgba(img)
    alpha = img.split()[-1]
    blobs = _find_blobs(alpha)
    if not blobs:
        return img
    _area, bbox = blobs[0]
    cropped = img.crop(bbox)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ox = (img.width - cropped.width) // 2
    oy = img.height - cropped.height - max(0, (img.height - cropped.height) // 8)
    out.paste(cropped, (ox, oy), cropped)
    return out


def analyze_frame(img: "Image.Image") -> FrameStats:
    img = _ensure_rgba(img)
    alpha = img.split()[-1]
    blobs = _find_blobs(alpha)
    if not blobs:
        return FrameStats((0, 0, img.width, img.height), 0, img.height // 2, img.width / 2, 0)
    area, bbox = blobs[0]
    l, t, r, b = bbox
    return FrameStats(bbox=bbox, area=area, foot_y=b - 1, center_x=(l + r) / 2, blob_count=len(blobs))


def validate_against_reference(ref: FrameStats, cur: FrameStats, canvas_area: int) -> Tuple[bool, str]:
    if cur.blob_count > MAX_BLOB_COUNT:
        return False, f"检测到 {cur.blob_count} 个角色区域（期望 1 个）"
    if ref.area <= 0 or cur.area <= 0:
        return False, "角色区域为空"
    area_ratio = cur.area / ref.area
    if area_ratio < (1 - MAX_AREA_RATIO_DEV) or area_ratio > (1 + MAX_AREA_RATIO_DEV):
        return False, f"面积比例异常 {area_ratio:.2f}"
    ref_h = ref.bbox[3] - ref.bbox[1]
    cur_h = cur.bbox[3] - cur.bbox[1]
    if ref_h > 0:
        h_ratio = cur_h / ref_h
        if h_ratio < (1 - MAX_HEIGHT_RATIO_DEV) or h_ratio > (1 + MAX_HEIGHT_RATIO_DEV):
            return False, f"高度比例异常 {h_ratio:.2f}"
    if cur.area < canvas_area * MIN_BLOB_AREA_RATIO:
        return False, "角色过小"
    return True, "ok"


def frame_lower_body_diff(a: "Image.Image", b: "Image.Image", leg_fraction: float = 0.52) -> float:
    """比较两帧角色下半身（腿区）像素差异比例，0=完全相同。"""
    a = _ensure_rgba(a)
    b = _ensure_rgba(b)
    if a.size != b.size:
        b = b.resize(a.size, Image.NEAREST)
    sa = analyze_frame(a)
    sb = analyze_frame(b)
    if sa.area <= 0 or sb.area <= 0:
        return 0.0

    l = min(sa.bbox[0], sb.bbox[0])
    r = max(sa.bbox[2], sb.bbox[2])
    foot = max(sa.foot_y, sb.foot_y)
    top = max(sa.bbox[1], sb.bbox[1])
    body_h = max(1, foot - top + 1)
    leg_top = int(foot - body_h * leg_fraction)
    leg_top = max(top, min(foot, leg_top))

    pa = a.load()
    pb = b.load()
    diff = 0
    total = 0
    for y in range(leg_top, min(a.height, foot + 1)):
        for x in range(max(0, l), min(a.width, r)):
            aa = pa[x, y][3]
            bb = pb[x, y][3]
            if aa < 32 and bb < 32:
                continue
            total += 1
            if aa >= 32 and bb >= 32:
                if abs(pa[x, y][0] - pb[x, y][0]) + abs(pa[x, y][1] - pb[x, y][1]) + abs(pa[x, y][2] - pb[x, y][2]) > 48:
                    diff += 1
            else:
                diff += 1
    if total <= 0:
        return 0.0
    return diff / total


def validate_pose_changed(
    prev: "Image.Image",
    cur: "Image.Image",
    min_diff: float = MIN_POSE_DIFF_RATIO,
) -> Tuple[bool, str]:
    ratio = frame_lower_body_diff(prev, cur)
    if ratio < min_diff:
        return False, f"腿区姿势与上一帧过于相似 (diff={ratio:.3f} < {min_diff})"
    return True, "ok"


def front_foot_depth(img: "Image.Image") -> Tuple[float, float]:
    """正面视角：左右半身的脚点最大 Y（越大=越靠前/越低）。忽略外侧武器/盾牌列。"""
    img = _ensure_rgba(img)
    stats = analyze_frame(img)
    if stats.area <= 0:
        return 0.0, 0.0
    l, t, r, b = stats.bbox
    foot_y0 = int(b - max(8, (b - t) * 0.28))
    mid_x = stats.center_x
    half_w = max(8.0, (r - l) * 0.5)
    left_x0 = int(l + half_w * 0.12)
    left_x1 = int(mid_x - half_w * 0.08)
    right_x0 = int(mid_x + half_w * 0.08)
    right_x1 = int(r - half_w * 0.12)
    px = img.load()
    left_max = 0.0
    right_max = 0.0
    for y in range(max(0, foot_y0), min(img.height, b + 1)):
        for x in range(max(0, left_x0), min(img.width, left_x1)):
            if px[x, y][3] < 32:
                continue
            left_max = max(left_max, float(y))
        for x in range(max(0, right_x0), min(img.width, right_x1)):
            if px[x, y][3] < 32:
                continue
            right_max = max(right_max, float(y))
    return left_max, right_max


def validate_front_walk_lead(img: "Image.Image", lead: str, min_gap: float = 2.0) -> Tuple[bool, str]:
    """校验正面 walk 帧是否明显左/右脚踏前。"""
    left_y, right_y = front_foot_depth(img)
    if lead == "left":
        if left_y <= 0 or right_y <= 0:
            return False, "未检测到双脚"
        if left_y < right_y + min_gap:
            return False, f"左脚未明显在前 (L={left_y:.0f}, R={right_y:.0f})"
    elif lead == "right":
        if left_y <= 0 or right_y <= 0:
            return False, "未检测到双脚"
        if right_y < left_y + min_gap:
            return False, f"右脚未明显在前 (L={left_y:.0f}, R={right_y:.0f})"
    return True, "ok"


def align_to_reference(
    ref: "Image.Image",
    frame: "Image.Image",
    frame_size: int,
    ref_stats: Optional[FrameStats] = None,
) -> "Image.Image":
    ref = _ensure_rgba(ref)
    frame = _ensure_rgba(frame)
    rs = ref_stats or analyze_frame(ref)
    fs = analyze_frame(frame)
    if fs.area <= 0 or rs.area <= 0:
        return frame

    ref_h = max(1, rs.bbox[3] - rs.bbox[1])
    cur_h = max(1, fs.bbox[3] - fs.bbox[1])
    scale = ref_h / cur_h
    content = frame.crop(fs.bbox)
    nw = max(1, int(content.width * scale))
    nh = max(1, int(content.height * scale))
    scaled = content.resize((nw, nh), Image.NEAREST)

    out = Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))
    target_cx = frame_size // 2
    target_foot = min(frame_size - 1, rs.foot_y)
    paste_x = int(target_cx - nw / 2)
    paste_y = int(target_foot - nh + 1)
    paste_y = max(0, min(frame_size - nh, paste_y))
    out.paste(scaled, (paste_x, paste_y), scaled)
    return out


def _fit_canvas(img: "Image.Image", frame_size: int) -> "Image.Image":
    img = _ensure_rgba(img)
    stats = analyze_frame(img)
    if stats.area <= 0:
        return Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))
    content = img.crop(stats.bbox)
    out = Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))
    scale = min(frame_size / content.width, frame_size / content.height, 1.0)
    nw = max(1, int(content.width * scale))
    nh = max(1, int(content.height * scale))
    scaled = content.resize((nw, nh), Image.NEAREST)
    ox = (frame_size - nw) // 2
    oy = frame_size - nh - max(0, frame_size // 16)
    out.paste(scaled, (ox, oy), scaled)
    return out


def fit_frame_preserve_head(
    img: "Image.Image",
    frame_size: int,
    ref_stats: FrameStats,
    margin_top: int = 4,
) -> "Image.Image":
    """按基准帧头顶对齐粘贴，保留前后脚高度差（正面 walk 用）。"""
    img = _ensure_rgba(img)
    bbox = img.getbbox()
    if not bbox:
        return img

    l, t, r, b = bbox
    ref_t = ref_stats.bbox[1]
    content = img.crop(bbox)
    out = Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))
    px = (frame_size - content.width) // 2
    py = ref_t
    if py + content.height > frame_size:
        py = frame_size - content.height
    if py < margin_top:
        py = margin_top
    out.paste(content, (px, py), content)
    return out


def fit_frame_preserving_feet(
    img: "Image.Image",
    frame_size: int,
    ref_stats: FrameStats,
    margin_top: int = 4,
) -> "Image.Image":
    """缩放/平移，保证全身在画布内，脚点与基准帧对齐，避免腿被裁切。"""
    img = _ensure_rgba(img)
    stats = analyze_frame(img)
    if stats.area <= 0:
        return img

    l, t, r, b = stats.bbox
    cw, ch = max(1, r - l), max(1, b - t)
    ref_h = max(1, ref_stats.bbox[3] - ref_stats.bbox[1])
    ref_foot = min(frame_size - 2, ref_stats.foot_y)
    max_h = frame_size - margin_top - 2

    scale = min(1.0, max_h / ch, (ref_h * 1.03) / ch)
    content = img.crop((l, t, r, b))
    if abs(scale - 1.0) > 0.001:
        nw = max(1, int(cw * scale))
        nh = max(1, int(ch * scale))
        content = content.resize((nw, nh), Image.NEAREST)

    out = Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))
    px = (frame_size - content.width) // 2
    py = ref_foot - content.height + 1
    if py + content.height > frame_size:
        py = frame_size - content.height
    if py < margin_top:
        py = margin_top
    out.paste(content, (px, py), content)
    return out


def postprocess_frame(
    img: "Image.Image",
    frame_size: int,
    reference: Optional["Image.Image"] = None,
    ref_stats: Optional[FrameStats] = None,
    align_reference: bool = True,
    extract_single: bool = True,
) -> "Image.Image":
    img = chroma_key_transparent(img)
    if extract_single:
        img = extract_largest_character(img)
    if align_reference and reference is not None:
        img = align_to_reference(reference, img, frame_size, ref_stats=ref_stats)
    elif img.width != frame_size or img.height != frame_size:
        img = _fit_canvas(img, frame_size)
    return img


def postprocess_png_bytes(
    raw: bytes,
    frame_size: int,
    reference: Optional["Image.Image"] = None,
    ref_stats: Optional[FrameStats] = None,
    *,
    align_reference: bool = True,
    extract_single: bool = True,
    preserve_pose: bool = False,
) -> "Image.Image":
    img = Image.open(io.BytesIO(raw)).convert("RGBA")
    if img.width != frame_size or img.height != frame_size:
        img = img.resize((frame_size, frame_size), Image.NEAREST)
    img = postprocess_frame(
        img,
        frame_size,
        reference,
        ref_stats,
        align_reference=align_reference and not preserve_pose,
        extract_single=extract_single,
    )
    if preserve_pose and ref_stats is not None:
        img = fit_frame_preserving_feet(img, frame_size, ref_stats)
    return img


def image_to_png_bytes(img: "Image.Image") -> bytes:
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def image_to_b64(img: "Image.Image") -> str:
    return base64.standard_b64encode(image_to_png_bytes(img)).decode("ascii")
