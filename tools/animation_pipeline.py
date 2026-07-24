#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pixel Eternal - 精灵动画管线

子命令:
  pack              将帧 PNG 拼成 Sprite Sheet + meta JSON（自动抠图/单角色/对齐）
  extract-gif       将 GIF（如 player.gif）拆帧 → sprite sheet + AI 走路姿势参考条
  demo-from-static  从静态贴图生成占位 walk/idle 帧（无需 API，一致性最高）
  generate          AI 参考图生帧（需 PE_ART_API_KEY），失败时回退程序化变形

示例:
  python tools/animation_pipeline.py extract-gif --input asset/player.gif --id player_walk_ref
  python tools/animation_pipeline.py generate --id goblin --base asset/monster_goblin.png \\
      --mode ai-ref --view front --walk-ref asset/animations/player_walk_ref/walk_leg_pose_ref.png
  python tools/animation_pipeline.py generate --id goblin --base asset/monster_goblin.png \\
      --subject "green goblin warrior" --action walk --frames 4
"""
from __future__ import annotations

import argparse
import io
import json
import math
import sys
import time
from pathlib import Path
from typing import List, Optional, Tuple

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "tools"))

import animation_frame_postprocess as afp  # noqa: E402

ART_FOLDER = PROJECT_ROOT / "asset"
ANIM_FOLDER = ART_FOLDER / "animations"
CONFIG_FILE = PROJECT_ROOT / "config" / "sprite-animations.json"

DEFAULT_FRAME_SIZE = int(__import__("os").environ.get("PE_ANIM_FRAME_SIZE", "128"))
MAX_GEN_RETRIES = int(__import__("os").environ.get("PE_ANIM_MAX_RETRIES", "3"))

FRAME_PROMPT_SUFFIX_SIDE = (
    "CRITICAL OUTPUT RULES: render EXACTLY ONE single animation frame of EXACTLY ONE character. "
    "NOT a spritesheet, NOT multiple characters, NOT character lineup, NOT 2x2 grid, NOT stamp sheet, "
    "NOT four copies, NOT animation strip inside the image. "
    "Edit the attached reference sprite: KEEP identical species, armor, weapon, colors, proportions, pixel style. "
    "CHANGE ONLY body pose for this walk-cycle keyframe — legs and arms must move visibly, NOT a sliding translation. "
    "Strict side profile facing right. Full body visible. Feet near bottom of frame. "
    "Solid pure black background (#000000) flat uniform, no floor, no shadow blob."
)

FRAME_PROMPT_SUFFIX_FRONT = (
    "CRITICAL OUTPUT RULES: render EXACTLY ONE single animation frame of EXACTLY ONE character. "
    "NOT a spritesheet, NOT multiple characters, NOT character lineup, NOT 2x2 grid. "
    "Edit the attached reference sprite: KEEP identical species, armor, shield, weapon, colors, pixel style. "
    "SAME front-facing camera angle as reference idle — character faces the camera (top-down RPG view). "
    "NOT side profile, NOT turning body away from camera. "
    "CHANGE ONLY leg/arm pose: one foot clearly forward toward camera, the other back — visible from front. "
    "Solid pure black background (#000000), no floor, no shadow blob."
)

FRAME_PROMPT_SUFFIX = FRAME_PROMPT_SUFFIX_SIDE

WALK_FRAME_STYLE_SIDE = (
    "Pixel art dark fantasy RPG enemy sprite, retro 16-bit style, ultra-detailed pixel clusters, "
    "strict side-view walk cycle animation frame facing right, single creature only, centered in frame, "
    "clear leg stride with one foot planted and the other lifted or passing, visible arm swing opposite to legs, "
    "NO ice-skating slide, NO identical copy of idle standing pose, "
    "solid pure black background (#000000) flat uniform behind the subject only, no ground plane, no floor tiles, "
    "no text, no watermark, razor-sharp pixel edges, no anti-aliasing, no photorealism, no 3D render look"
)

WALK_FRAME_STYLE_FRONT = (
    "Pixel art dark fantasy RPG enemy sprite, retro 16-bit style, ultra-detailed pixel clusters, "
    "front-facing toward camera, same angle as idle reference, top-down action RPG combat sprite, "
    "both legs visible from front with clear depth: one boot forward/closer/lower, one boot back/further, "
    "alternating walk contact pose, shield and sword unchanged, "
    "solid pure black background (#000000), no ground plane, razor-sharp pixel edges, no anti-aliasing"
)

WALK_FRAME_STYLE = WALK_FRAME_STYLE_SIDE

WALK_POSE_HINTS = (
    (
        "walk KEYFRAME 1 contact — strict side view facing right: "
        "LEFT foot stepped far FORWARD flat on ground; RIGHT leg stretched BACK with toes down; "
        "long visible stride; left arm swung back, right arm forward"
    ),
    (
        "walk KEYFRAME 2 passing — strict side view facing right: "
        "RIGHT foot planted under body; LEFT knee raised with foot lifted OFF ground in front; "
        "legs clearly crossed in profile, NOT same as contact pose"
    ),
    (
        "walk KEYFRAME 3 contact — strict side view facing right: "
        "RIGHT foot stepped far FORWARD flat on ground; LEFT leg stretched BACK with toes down; "
        "mirror opposite of keyframe 1; left arm forward, right arm back"
    ),
    (
        "walk KEYFRAME 4 passing — strict side view facing right: "
        "LEFT foot planted under body; RIGHT knee raised with foot lifted OFF ground in front; "
        "mirror opposite of keyframe 2; legs clearly crossed in profile"
    ),
)

SIDE_BASE_PROMPT_TEMPLATE = (
    "{subject}. Convert the attached front-view sprite into ONE strict side-profile sprite facing RIGHT. "
    "Keep identical design, colors, armor, weapon, shield, pixel style. "
    "Standing IDLE neutral: feet together side-by-side under hips, knees straight, weight balanced, NOT stepping. "
    "Both legs fully visible from side. NOT front view, NOT three-quarter view, NOT walking, NOT running."
)


def _leg_suffix(entity_id: str) -> str:
    return LEG_PROMPT_SUFFIX.get(entity_id, "Both feet with consistent footwear, normal biped legs.")


def _resolve_view_config(view: str, frame_count: int) -> dict:
    view = (view or "front").lower()
    if view == "front":
        poses = list(WALK_CONTACT_POSES_FRONT) if frame_count == 2 else list(WALK_POSE_HINTS)
        return {
            "view": "front",
            "style": WALK_FRAME_STYLE_FRONT,
            "prompt_suffix": FRAME_PROMPT_SUFFIX_FRONT,
            "contact_poses": poses,
            "needs_side_base": False,
            "stride_world": 10,
        }
    poses = list(WALK_CONTACT_POSES_SIDE) if frame_count == 2 else list(WALK_POSE_HINTS)
    return {
        "view": "side",
        "style": WALK_FRAME_STYLE_SIDE,
        "prompt_suffix": FRAME_PROMPT_SUFFIX_SIDE,
        "contact_poses": poses,
        "needs_side_base": True,
        "stride_world": 10,
    }


def _foot_spread_x(img) -> int:
    stats = afp.analyze_frame(img)
    if stats.area <= 0:
        return 0
    img = img.convert("RGBA")
    l, t, r, b = stats.bbox
    foot_y0 = max(t, b - max(6, (b - t) // 6))
    px = img.load()
    xs = []
    for y in range(foot_y0, min(img.height, b + 1)):
        for x in range(l, r):
            if px[x, y][3] >= 32:
                xs.append(x)
    if len(xs) < 2:
        return 0
    return max(xs) - min(xs)

SUBJECT_PRESETS = {
    "goblin": (
        "small green goblin mob, crude leather armor scraps, rusty short sword, round wooden shield, "
        "big pointy ears, yellow eyes, hunched build, "
        "both legs in dark brown pants with matching brown leather boots on BOTH feet"
    ),
    "demon": (
        "large red horned abyss demon, muscular humanoid, sharp claws, dark purple-black accents, "
        "long tail, glowing eyes, menacing silhouette"
    ),
}

LEG_PROMPT_SUFFIX = {
    "goblin": (
        "Leg rules: BOTH feet must wear identical brown leather boots over dark pants. "
        "Green skin visible only on arms and face, NOT on feet or shins. "
        "Bent knee on lifted leg, planted heel-to-toe on ground leg, anatomically normal goblin legs."
    ),
}

WALK_CONTACT_POSES_SIDE = (
    WALK_POSE_HINTS[0],
    WALK_POSE_HINTS[2],
)

WALK_CONTACT_POSES_FRONT = (
    (
        "walk contact A — facing camera EXACTLY like idle: viewer's LEFT leg stepped distinctly "
        "FORWARD (boot lower on screen, knee bent forward); viewer's RIGHT leg clearly BACK "
        "(boot higher on screen, shorter visible shin). Large visible gap between foot heights. "
        "Do NOT only change knee highlights or armor shine."
    ),
    (
        "walk contact B — facing camera EXACTLY like idle: viewer's RIGHT leg stepped distinctly "
        "FORWARD (boot lower on screen); viewer's LEFT leg clearly BACK (boot higher on screen). "
        "Must be obvious leg swap from contact A. Do NOT only change knee decoration."
    ),
)

WALK_CONTACT_POSES = WALK_CONTACT_POSES_SIDE

FRAME_NEGATIVE_EXTRA = (
    "spritesheet, sprite sheet, multiple characters, character sheet, lineup, grid, 2x2, 4 characters, "
    "duplicate characters, crowd, two characters, three characters, white background, gray background, "
    "gradient background, ground plane, floor tiles, "
    "bare foot, bare feet, naked foot, one boot one bare foot, mismatched footwear, extra leg, missing leg"
)


def _load_pil():
    try:
        from PIL import Image
    except ImportError:
        sys.exit("请安装 Pillow: pip install Pillow")
    return Image


def _content_bbox(img) -> Tuple[int, int, int, int]:
    return afp.analyze_frame(img).bbox


def _detect_anchor(frame_size: int, bbox) -> dict:
    _l, _t, _r, b = bbox
    return {"x": frame_size // 2, "y": min(frame_size - 1, b - 1 if b > 0 else frame_size - 1)}


def _resolve_player_gif_path() -> Optional[Path]:
    for rel in ("player.gif", "player/player.gif"):
        p = ART_FOLDER / rel
        if p.is_file():
            return p
    dep = PROJECT_ROOT / "deployment" / "asset" / "player.gif"
    return dep if dep.is_file() else None


def _sample_frame_indices(indices: List[int], count: int) -> List[int]:
    if count <= 0 or not indices:
        return []
    if count >= len(indices):
        return list(indices)
    if count == 1:
        return [indices[0]]
    step = (len(indices) - 1) / (count - 1)
    return [indices[int(round(i * step))] for i in range(count)]


def _extract_gif_frames(
    gif_path: Path,
    frame_size: int,
    *,
    frame_indices: Optional[List[int]] = None,
) -> Tuple[list, List[int]]:
    """从 GIF 提取帧，按首帧脚点对齐到 frame_size 画布。"""
    Image = _load_pil()
    im = Image.open(gif_path)
    n = getattr(im, "n_frames", 1)
    indices = frame_indices if frame_indices is not None else list(range(n))
    raw_frames: list = []
    delays: List[int] = []
    for i in indices:
        im.seek(i)
        raw_frames.append(im.convert("RGBA"))
        delays.append(int(im.info.get("duration", 100) or 100))

    ref = afp.postprocess_frame(raw_frames[0], frame_size)
    ref_stats = afp.analyze_frame(ref)
    normalized = [ref]
    for fr in raw_frames[1:]:
        processed = afp.postprocess_frame(fr, frame_size, align_reference=False, extract_single=False)
        normalized.append(afp.align_to_reference(ref, processed, frame_size, ref_stats=ref_stats))
    return normalized, delays


def _fit_pose_thumb(fr, thumb_size: int, leg_only: bool) -> "afp.Image.Image":
    Image = _load_pil()
    fr = fr.convert("RGBA")
    if leg_only:
        stats = afp.analyze_frame(fr)
        if stats.area > 0:
            l, t, r, b = stats.bbox
            leg_top = int(t + (b - t) * 0.45)
            fr = fr.crop((l, leg_top, r, b))
    bbox = fr.getbbox()
    if bbox:
        fr = fr.crop(bbox)
    w, h = fr.size
    if w <= 0 or h <= 0:
        return Image.new("RGBA", (thumb_size, thumb_size), (0, 0, 0, 0))
    scale = min(thumb_size / w, thumb_size / h)
    nw = max(1, int(w * scale))
    nh = max(1, int(h * scale))
    fr = fr.resize((nw, nh), Image.NEAREST)
    cell = Image.new("RGBA", (thumb_size, thumb_size), (0, 0, 0, 0))
    cell.paste(fr, ((thumb_size - nw) // 2, thumb_size - nh), fr)
    return cell


def _build_pose_ref_sheet(
    frames: list,
    frame_indices: List[int],
    *,
    thumb_size: int = 96,
    leg_only: bool = False,
) -> "afp.Image.Image":
    """横向姿势条：供 AI 理解 walk 各关键帧的腿部变化节奏。"""
    Image = _load_pil()
    thumbs = [_fit_pose_thumb(frames[i], thumb_size, leg_only) for i in frame_indices]
    sheet_w = thumb_size * max(1, len(thumbs))
    sheet = Image.new("RGBA", (sheet_w, thumb_size), (0, 0, 0, 0))
    for i, cell in enumerate(thumbs):
        sheet.paste(cell, (i * thumb_size, 0), cell)
    return sheet


def _load_walk_pose_ref_frames(ref_path: Path, frame_size: int) -> Tuple[List["afp.Image.Image"], Optional["afp.Image.Image"], Optional["afp.Image.Image"]]:
    """
    加载 walk 姿势参考。
    返回 (逐帧列表, 全身姿势条, 腿部姿势条)。
    """
    Image = _load_pil()
    ref_path = Path(ref_path)
    per_frame: List = []
    body_strip = None
    leg_strip = None

    if ref_path.is_dir():
        walk_dir = ref_path / "walk_frames"
        if walk_dir.is_dir():
            files = sorted(walk_dir.glob("*.png"))
            per_frame = [Image.open(p).convert("RGBA") for p in files]
        else:
            files = sorted(ref_path.glob("walk_*.png")) or sorted(ref_path.glob("frame_*.png"))
            per_frame = [Image.open(p).convert("RGBA") for p in files]
        body_strip_path = ref_path / "walk_pose_ref.png"
        leg_strip_path = ref_path / "walk_leg_pose_ref.png"
        if body_strip_path.is_file():
            body_strip = Image.open(body_strip_path).convert("RGBA")
        if leg_strip_path.is_file():
            leg_strip = Image.open(leg_strip_path).convert("RGBA")
        return per_frame, body_strip, leg_strip

    if ref_path.suffix.lower() == ".json" and ref_path.is_file():
        meta = json.loads(ref_path.read_text(encoding="utf-8"))
        root = ref_path.parent
        for rel in meta.get("walk_frame_files") or []:
            p = root / rel
            if p.is_file():
                per_frame.append(Image.open(p).convert("RGBA"))
        for key, attr in (("pose_ref", "body_strip"), ("leg_pose_ref", "leg_strip")):
            rel = meta.get(key)
            if rel:
                p = root / Path(rel).name if "/" not in str(rel) else PROJECT_ROOT / "asset" / rel
                if not p.is_file():
                    p = root / Path(rel).name
                if p.is_file():
                    img = Image.open(p).convert("RGBA")
                    if attr == "body_strip":
                        body_strip = img
                    else:
                        leg_strip = img
        return per_frame, body_strip, leg_strip

    if ref_path.is_file():
        img = Image.open(ref_path).convert("RGBA")
        name = ref_path.name.lower()
        if "leg" in name:
            leg_strip = img
        else:
            body_strip = img
    return per_frame, body_strip, leg_strip


def _pick_walk_pose_ref(
    frame_index: int,
    frame_count: int,
    per_frame: List,
    body_strip,
    leg_strip,
) -> Tuple[Optional["afp.Image.Image"], str]:
    """为当前生帧挑选最合适的 walk 姿势参考图与 label。"""
    if per_frame:
        if len(per_frame) == frame_count:
            idx = frame_index
        else:
            idx = int(round(frame_index * (len(per_frame) - 1) / max(1, frame_count - 1)))
        idx = max(0, min(len(per_frame) - 1, idx))
        return per_frame[idx], (
            f"walk leg pose reference frame {idx + 1}/{len(per_frame)} — "
            "copy ONLY leg timing/depth/alternation from this frame, NOT player colors or design"
        )
    if leg_strip is not None:
        return leg_strip, (
            "walk LEG pose strip left-to-right — copy leg alternation rhythm and front/back foot depth ONLY; "
            "do NOT copy player appearance; keep monster design from image 1"
        )
    if body_strip is not None:
        return body_strip, (
            "walk pose strip left-to-right — use leg pose rhythm only, NOT player design or colors"
        )
    return None, ""


def _prepare_base_frame(base_path: Path, frame_size: int) -> "afp.Image.Image":
    Image = _load_pil()
    raw = Image.open(base_path).convert("RGBA")
    if raw.width != frame_size or raw.height != frame_size:
        raw = raw.resize((frame_size, frame_size), Image.NEAREST)
    return afp.postprocess_frame(raw, frame_size)


def pack_frames(
    frames: list,
    anim_id: str,
    frame_size: int = DEFAULT_FRAME_SIZE,
    animations: Optional[dict] = None,
    reference: Optional[object] = None,
    register_config: bool = True,
) -> Tuple[Path, Path]:
    Image = _load_pil()
    ref = reference
    ref_stats = afp.analyze_frame(ref) if ref is not None else None

    normalized = []
    for i, fr in enumerate(frames):
        img = fr.convert("RGBA") if hasattr(fr, "convert") else fr
        if img.width != frame_size or img.height != frame_size:
            img = img.resize((frame_size, frame_size), Image.NEAREST)
        # idle 帧对齐基准；walk 帧保留动作差异
        if reference is not None and i > 0:
            normalized.append(afp.postprocess_frame(img, frame_size, align_reference=False, extract_single=False))
        else:
            normalized.append(afp.postprocess_frame(img, frame_size, reference=ref, ref_stats=ref_stats))

    n = len(normalized)
    sheet_w = frame_size * n
    sheet = Image.new("RGBA", (sheet_w, frame_size), (0, 0, 0, 0))
    frame_rects = []
    for i, fr in enumerate(normalized):
        x = i * frame_size
        sheet.paste(fr, (x, 0), fr)
        frame_rects.append({"x": x, "y": 0, "w": frame_size, "h": frame_size})

    anchor = _detect_anchor(frame_size, _content_bbox(normalized[0]))

    if animations is None:
        if n >= 5:
            animations = {
                "idle": {"frames": [0], "fps": 4, "loop": True},
                "walk": {"frames": [1, 2, 3, 4], "fps": 8, "loop": True},
            }
        elif n >= 2:
            animations = {
                "idle": {"frames": [0], "fps": 4, "loop": True},
                "walk": {"frames": list(range(1, n)), "fps": 8, "loop": True},
            }
        else:
            animations = {"idle": {"frames": [0], "fps": 4, "loop": True}}

    out_dir = ANIM_FOLDER
    out_dir.mkdir(parents=True, exist_ok=True)
    sheet_path = out_dir / f"{anim_id}_sheet.png"
    meta_path = out_dir / f"{anim_id}.json"
    sheet.save(sheet_path, "PNG")

    meta = {
        "id": anim_id,
        "sheet": f"animations/{anim_id}_sheet.png",
        "frameWidth": frame_size,
        "frameHeight": frame_size,
        "sheetWidth": sheet_w,
        "sheetHeight": frame_size,
        "anchor": anchor,
        "frames": frame_rects,
        "animations": animations,
    }
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    if register_config:
        _register_animation_config(anim_id, meta["sheet"], f"animations/{anim_id}.json")
    print(f"已写入 {sheet_path.relative_to(PROJECT_ROOT)}（透明底 RGBA）")
    print(f"已写入 {meta_path.relative_to(PROJECT_ROOT)}")
    return sheet_path, meta_path


def _register_animation_config(anim_id: str, sheet_rel: str, meta_rel: str) -> None:
    data = {}
    if CONFIG_FILE.is_file():
        try:
            data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            data = {}
    entities = data.setdefault("entities", {})
    entities[anim_id] = {"sheet": sheet_rel, "meta": meta_rel}
    CONFIG_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"已更新 {CONFIG_FILE.relative_to(PROJECT_ROOT)}")


# 两帧 walk：仅轻微垂直起伏，脚点不动，避免左右抽搐
WALK_KEY_POSES = (
    {"shift_x": 0, "lift": 0, "tilt": 0.0, "scale_x": 1.0, "scale_y": 0.99},
    {"shift_x": 0, "lift": -1, "tilt": 0.0, "scale_x": 1.0, "scale_y": 1.0},
)


def _procedural_walk_frame(
    base,
    frame_size: int,
    frame_idx: int,
    walk_frames: int = 4,
    split_ratio: float = 0.66,
) -> "afp.Image.Image":
    """从基准帧生成 walk 帧：整身平移 + 倾斜 + 挤压，单角色、透明底。"""
    del walk_frames, split_ratio  # 保留参数兼容 CLI
    Image = _load_pil()
    stats = afp.analyze_frame(base)
    if stats.area <= 0:
        return base.copy()

    key = WALK_KEY_POSES[frame_idx % len(WALK_KEY_POSES)]
    content = base.crop(stats.bbox)
    cw, ch = content.size

    nw = max(1, int(cw * key["scale_x"]))
    nh = max(1, int(ch * key["scale_y"]))
    scaled = content.resize((nw, nh), Image.NEAREST)

    tilt = key["tilt"]
    if abs(tilt) > 0.01:
        transformed = scaled.rotate(tilt, resample=Image.NEAREST, expand=True)
    else:
        transformed = scaled

    out = Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))
    paste_x = int(frame_size // 2 - transformed.width / 2 + key["shift_x"])
    paste_y = int(stats.foot_y - transformed.height + 1 + key["lift"])
    out.paste(transformed, (paste_x, paste_y), transformed)
    out = afp.fit_frame_preserving_feet(out, frame_size, stats)
    return afp.postprocess_frame(out, frame_size, align_reference=False, extract_single=False)


def _smoothstep(edge0: float, edge1: float, x: float) -> float:
    if edge0 == edge1:
        return 1.0 if x >= edge1 else 0.0
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def _side_weight(x: int, mid_x: int, l: int, r: int, side: str) -> float:
    if side == "left":
        if x >= mid_x:
            return 0.0
        return _smoothstep(mid_x, l, float(x))
    if x <= mid_x:
        return 0.0
    return _smoothstep(mid_x, r, float(x))


def _procedural_front_walk_frame(
    base,
    frame_idx: int,
    frame_size: int,
) -> "afp.Image.Image":
    """正面 walk：左右腿整块平移（不缩放、不重映射），保持腿脚连贯。"""
    Image = _load_pil()
    stats = afp.analyze_frame(base)
    if stats.area <= 0:
        return base.copy()

    l, t, r, b = stats.bbox
    mid_x = int(stats.center_x)
    base_rgba = base.convert("RGBA")
    w, h = base_rgba.size

    hip_y = int(t + (b - t) * 0.72)
    overlap = 12
    forward_dy = 3
    back_dy = -2

    if frame_idx % 2 == 0:
        left_dy = forward_dy
        right_dy = back_dy
    else:
        left_dy = back_dy
        right_dy = forward_dy

    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    legs = [
        (l, mid_x, left_dy),
        (mid_x, r, right_dy),
    ]
    legs.sort(key=lambda item: item[2])

    crop_top = max(t, hip_y - overlap)
    for x0, x1, dy in legs:
        leg = base_rgba.crop((x0, crop_top, x1, b))
        out.paste(leg, (x0, crop_top + dy), leg)

    cover_y = hip_y + max(abs(forward_dy), abs(back_dy)) + 4
    upper = base_rgba.crop((l, t, r, min(b, cover_y)))
    out.paste(upper, (l, t), upper)

    ref_stats = afp.analyze_frame(base)
    return afp.fit_frame_preserve_head(out, frame_size, ref_stats)


def _generate_with_references(ag, ref_images: list, prompt: str, style: str, ref_labels: Optional[list] = None, prompt_suffix: Optional[str] = None) -> bytes:
    """Gemini 多模态：附多张参考图生单帧。"""
    import requests

    suffix = prompt_suffix or FRAME_PROMPT_SUFFIX
    full_prompt = f"{prompt}. {style}. {suffix}".strip()
    neg = f"{ag.MONSTER_TEXTURE_NEGATIVE_PROMPT}, {FRAME_NEGATIVE_EXTRA}"
    label_lines = ""
    if ref_labels:
        label_lines = "Attached reference images:\n" + "\n".join(
            f"- Image {i + 1}: {ref_labels[i]}" for i in range(len(ref_labels))
        ) + "\n\n"
    text = f"{label_lines}{full_prompt}\n\nAvoid / do not render: {neg}"
    parts = []
    for ref_img in ref_images:
        parts.append({"inline_data": {"mime_type": "image/png", "data": afp.image_to_b64(ref_img)}})
    parts.append({"text": text})
    headers = {
        "Authorization": f"Bearer {ag.API_KEY}",
        "Content-Type": "application/json",
    }
    body = {"contents": [{"role": "user", "parts": parts}]}
    resp = requests.post(ag.GEMINI_IMAGE_URL, headers=headers, json=body, timeout=180)
    resp.raise_for_status()
    raw = ag._bytes_from_gemini_style_response(resp.json())
    if raw is None:
        raise RuntimeError("参考图生帧未返回图片数据")
    return raw


def _generate_with_reference(ag, ref_img, prompt: str, style: str) -> bytes:
    return _generate_with_references(ag, [ref_img], prompt, style, ["character reference"])


def _postprocess_anim_frame(
    raw: bytes,
    frame_size: int,
    ref_stats: afp.FrameStats,
) -> "afp.Image.Image":
    return afp.postprocess_png_bytes(
        raw,
        frame_size,
        ref_stats=ref_stats,
        align_reference=False,
        preserve_pose=True,
    )


def _try_generate_side_base(
    ag,
    front_base,
    front_stats: afp.FrameStats,
    subject: str,
    frame_size: int,
    style: str,
    entity_id: str = "",
) -> Optional["afp.Image.Image"]:
    canvas_area = frame_size * frame_size
    prompt = SIDE_BASE_PROMPT_TEMPLATE.format(subject=subject) + " " + _leg_suffix(entity_id)
    best_img = None
    best_spread = 10_000
    for attempt in range(1, MAX_GEN_RETRIES + 1):
        try:
            print(f"  侧视基准 尝试 {attempt}/{MAX_GEN_RETRIES} …")
            if ag.PE_IMAGE_BACKEND in ("gemini", "google", "vertex", "generatecontent", "auto"):
                raw = _generate_with_references(
                    ag,
                    [front_base],
                    prompt,
                    style,
                    ["front-view design reference to convert into side profile"],
                )
            else:
                raw = ag.generate_image(
                    f"{prompt}. {FRAME_PROMPT_SUFFIX}",
                    style,
                    for_monster_texture=True,
                    extra_negative=FRAME_NEGATIVE_EXTRA,
                )
            img = _postprocess_anim_frame(raw, frame_size, front_stats)
            cur_stats = afp.analyze_frame(img)
            ok, reason = afp.validate_against_reference(front_stats, cur_stats, canvas_area)
            if not ok:
                print(f"    校验失败: {reason}")
                continue
            diff = afp.frame_lower_body_diff(front_base, img)
            spread = _foot_spread_x(img)
            if diff < 0.04:
                print(f"    侧视差异过小 (diff={diff:.3f})，仍像正面")
                continue
            if spread < best_spread:
                best_img = img
                best_spread = spread
            if spread <= 28:
                print(f"    侧视基准 OK (leg diff={diff:.3f}, foot spread={spread}px)")
                return img
            print(f"    脚距偏大 (spread={spread}px)，继续尝试…")
        except Exception as e:
            print(f"    生图失败: {e}")
        if attempt < MAX_GEN_RETRIES:
            time.sleep(1.5 * attempt)
    if best_img is not None:
        print(f"  → 使用脚距最小的侧视基准 (spread={best_spread}px)")
        return best_img
    return None


def _try_generate_walk_frame(
    ag,
    design_ref,
    anim_ref,
    anim_stats: afp.FrameStats,
    prev_frame,
    subject: str,
    action: str,
    pose: str,
    frame_size: int,
    style: str,
    frame_index: int,
    entity_id: str = "",
    frame_count: int = 4,
    view: str = "front",
    prompt_suffix: Optional[str] = None,
    walk_pose_ref=None,
    walk_pose_label: str = "",
) -> Optional["afp.Image.Image"]:
    canvas_area = frame_size * frame_size
    view = (view or "front").lower()
    leg = _leg_suffix(entity_id)
    if view == "front":
        prompt = (
            f"{subject}. Front-facing top-down RPG {action} animation. {pose}. {leg} "
            f"SAME camera as idle reference — face the camera, do NOT turn to side profile. "
            f"Image 1 = idle design lock. Image 2 = previous walk frame. "
            f"Swap which boot is forward toward camera vs image 2; both legs visible from front."
        )
        refs = [design_ref, prev_frame]
        labels = [
            "idle reference — same front-facing angle and equipment",
            "previous walk frame — swap which leg is forward toward camera",
        ]
        idle_ref = design_ref
    else:
        prompt = (
            f"{subject}. Side-view {action} animation. {pose}. {leg} "
            f"Edit references into this EXACT keyframe. Image 1 = color/design lock. "
            f"Image 2 = side-view body proportions. Image 3 = previous animation frame to advance from. "
            f"The TWO LEGS must be in clearly different positions than image 3 — alternate which boot is forward."
        )
        refs = [design_ref, anim_ref, prev_frame]
        labels = [
            "front/design reference for colors and equipment only",
            "side-view standing reference for proportions",
            "previous walk frame — change leg positions from this",
        ]
        idle_ref = anim_ref
    if walk_pose_ref is not None:
        prompt += (
            " Use the attached walk pose reference for LEG MOVEMENT TIMING ONLY — "
            "match which leg is forward and how far apart the feet are, but keep monster design from image 1."
        )
        refs.append(walk_pose_ref)
        labels.append(walk_pose_label or "walk pose reference — legs only, not character design")
    for attempt in range(1, MAX_GEN_RETRIES + 1):
        try:
            print(f"    尝试 {attempt}/{MAX_GEN_RETRIES} …")
            if ag.PE_IMAGE_BACKEND in ("gemini", "google", "vertex", "generatecontent", "auto"):
                raw = _generate_with_references(ag, refs, prompt, style, labels, prompt_suffix)
            else:
                raw = ag.generate_image(
                    f"{prompt}. {prompt_suffix or FRAME_PROMPT_SUFFIX}",
                    style,
                    for_monster_texture=True,
                    extra_negative=FRAME_NEGATIVE_EXTRA,
                )
            img = _postprocess_anim_frame(raw, frame_size, anim_stats)
            cur_stats = afp.analyze_frame(img)
            ok, reason = afp.validate_against_reference(anim_stats, cur_stats, canvas_area)
            if not ok:
                print(f"    校验失败: {reason}")
                continue
            pose_ok, pose_reason = afp.validate_pose_changed(prev_frame, img)
            if not pose_ok:
                print(f"    姿势校验失败: {pose_reason}")
                continue
            if frame_index in (0, 2) or frame_count <= 2:
                base_ok, base_reason = afp.validate_pose_changed(idle_ref, img, min_diff=0.06)
                if not base_ok:
                    print(f"    contact 帧不够明显: {base_reason}")
                    continue
            if view == "front":
                lead = "left" if frame_index % 2 == 0 else "right"
                foot_ok, foot_reason = afp.validate_front_walk_lead(img, lead, min_gap=3.0)
                if not foot_ok:
                    print(f"    前后脚校验失败: {foot_reason}")
                    continue
            ly, ry = afp.front_foot_depth(img)
            print(f"    校验通过 (leg diff={afp.frame_lower_body_diff(prev_frame, img):.3f}, feet L={ly:.0f} R={ry:.0f})")
            return img
        except Exception as e:
            print(f"    生图失败: {e}")
        if attempt < MAX_GEN_RETRIES:
            time.sleep(1.5 * attempt)
    return None


def cmd_extract_gif(args: argparse.Namespace) -> None:
    gif_path = Path(args.input) if args.input else _resolve_player_gif_path()
    if gif_path:
        gif_path = gif_path.resolve()
    if not gif_path or not gif_path.is_file():
        sys.exit("未找到 GIF：请用 --input 指定，或将 player.gif 放到 asset/ 下")

    try:
        gif_rel = gif_path.relative_to(PROJECT_ROOT.resolve())
    except ValueError:
        gif_rel = gif_path

    frame_size = args.frame_size
    indices = None
    if args.frames:
        indices = [int(x.strip()) for x in args.frames.split(",") if x.strip()]

    print(f"拆帧: {gif_rel} → id={args.id}")
    frames, delays = _extract_gif_frames(gif_path, frame_size, frame_indices=indices)
    print(f"  共 {len(frames)} 帧，delay(ms)={delays[:8]}{'…' if len(delays) > 8 else ''}")

    idle_idx = max(0, min(len(frames) - 1, args.idle_frame))
    walk_indices = [i for i in range(len(frames)) if i != idle_idx]
    ordered = [frames[idle_idx]] + [frames[i] for i in walk_indices]

    out_dir = ANIM_FOLDER / args.id
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.save_frames:
        fr_dir = out_dir / "frames"
        fr_dir.mkdir(parents=True, exist_ok=True)
        for i, fr in enumerate(frames):
            fr.save(fr_dir / f"frame_{i:03d}.png", "PNG")
        walk_dir = out_dir / "walk_frames"
        walk_dir.mkdir(parents=True, exist_ok=True)
        for j, wi in enumerate(walk_indices):
            frames[wi].save(walk_dir / f"walk_{j:03d}.png", "PNG")

    walk_fps = args.walk_fps
    animations = {
        "idle": {"frames": [0], "fps": 4, "loop": True},
        "walk": {"frames": list(range(1, len(ordered))), "fps": walk_fps, "loop": True},
    }
    pack_frames(
        ordered, args.id, frame_size=frame_size, animations=animations,
        reference=ordered[0], register_config=False,
    )

    sample_n = args.pose_samples if args.pose_samples > 0 else min(6, len(walk_indices))
    sampled = _sample_frame_indices(walk_indices, sample_n)
    body_ref = _build_pose_ref_sheet(frames, sampled, thumb_size=args.pose_thumb, leg_only=False)
    leg_ref = _build_pose_ref_sheet(frames, sampled, thumb_size=args.pose_thumb, leg_only=True)
    body_ref_path = out_dir / "walk_pose_ref.png"
    leg_ref_path = out_dir / "walk_leg_pose_ref.png"
    body_ref.save(body_ref_path, "PNG")
    leg_ref.save(leg_ref_path, "PNG")

    manifest = {
        "id": args.id,
        "source_gif": str(gif_rel).replace("\\", "/"),
        "frame_size": frame_size,
        "frame_count": len(frames),
        "idle_frame": idle_idx,
        "walk_frames": walk_indices,
        "walk_frame_files": [f"walk_frames/walk_{j:03d}.png" for j in range(len(walk_indices))],
        "pose_ref": f"animations/{args.id}/walk_pose_ref.png",
        "leg_pose_ref": f"animations/{args.id}/walk_leg_pose_ref.png",
        "pose_sample_indices": sampled,
        "delays_ms": delays,
        "view": "front",
        "usage": "Attach walk_leg_pose_ref.png or walk_frames/ as --walk-ref when running generate --mode ai-ref",
    }
    manifest_path = out_dir / "walk_ref.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"  全身姿势条 → {body_ref_path.relative_to(PROJECT_ROOT)} ({sample_n} 关键帧)")
    print(f"  腿部姿势条 → {leg_ref_path.relative_to(PROJECT_ROOT)}（推荐作 AI --walk-ref）")
    print(f"  清单 → {manifest_path.relative_to(PROJECT_ROOT)}")


def cmd_pack(args: argparse.Namespace) -> None:
    Image = _load_pil()
    src = Path(args.frames_dir)
    if not src.is_dir():
        sys.exit(f"帧目录不存在: {src}")
    files = sorted(src.glob("*.png")) + sorted(src.glob("*.webp"))
    if not files:
        sys.exit(f"目录内无 PNG: {src}")
    frames = [Image.open(p).convert("RGBA") for p in files]
    ref = _prepare_base_frame(frames[0], args.frame_size) if frames else None
    animations = None
    if args.anim_json:
        animations = json.loads(Path(args.anim_json).read_text(encoding="utf-8"))
    pack_frames(frames, args.id, frame_size=args.frame_size, animations=animations, reference=ref)


def cmd_demo_from_static(args: argparse.Namespace) -> None:
    base = _prepare_base_frame(Path(args.base), args.frame_size)
    walk_count = max(2, args.walk_frames)
    frames = [base.copy()]
    for i in range(walk_count):
        frames.append(_procedural_walk_frame(base, args.frame_size, i, walk_count))
    animations = {
        "idle": {"frames": [0], "fps": 4, "loop": True},
        "walk": {"frames": list(range(1, len(frames))), "fps": 8, "loop": True},
    }
    pack_frames(frames, args.id, frame_size=args.frame_size, animations=animations, reference=base)
    if args.save_frames:
        fr_dir = ANIM_FOLDER / args.id / "frames"
        fr_dir.mkdir(parents=True, exist_ok=True)
        for i, fr in enumerate(frames):
            fr.save(fr_dir / f"frame_{i:03d}.png", "PNG")


def cmd_generate(args: argparse.Namespace) -> None:
    try:
        import art_generator as ag
    except ImportError as e:
        sys.exit(f"无法导入 art_generator: {e}")

    if args.mode == "procedural":
        if not args.base:
            sys.exit("procedural 模式需要 --base")
        cmd_demo_from_static(argparse.Namespace(
            base=args.base, id=args.id, frame_size=args.frame_size,
            walk_frames=args.frames, save_frames=args.save_frames,
        ))
        return

    if args.mode == "procedural-front":
        if not args.base:
            sys.exit("procedural-front 模式需要 --base")
        base = _prepare_base_frame(Path(args.base), args.frame_size)
        frame_count = max(2, args.frames)
        view_cfg = _resolve_view_config(getattr(args, "view", "front"), frame_count)
        print(f"程序化正面 walk（膝下平移）· 视角 {view_cfg['view']}")
        frames = [base.copy()]
        for idx in range(frame_count):
            frame = _procedural_front_walk_frame(base, idx, args.frame_size)
            lead = "left" if idx % 2 == 0 else "right"
            ok, reason = afp.validate_front_walk_lead(frame, lead, min_gap=3.0)
            ly, ry = afp.front_foot_depth(frame)
            status = "OK" if ok else reason
            print(f"  walk 帧 {idx + 1}: 前脚={lead} · L={ly:.0f} R={ry:.0f} · {status}")
            frames.append(frame)
        if args.save_frames:
            fr_dir = ANIM_FOLDER / args.id / "frames"
            fr_dir.mkdir(parents=True, exist_ok=True)
            for i, fr in enumerate(frames):
                fr.save(fr_dir / f"frame_{i:03d}.png", "PNG")
        walk_fps = 6 if frame_count == 2 else 8
        animations = {
            "idle": {"frames": [0], "fps": 4, "loop": True},
            "walk": {"frames": list(range(1, len(frames))), "fps": walk_fps, "loop": True},
        }
        pack_frames(frames, args.id, frame_size=args.frame_size, animations=animations, reference=base)
        meta_path = ANIM_FOLDER / f"{args.id}.json"
        if meta_path.is_file():
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            meta["view"] = view_cfg["view"]
            meta["strideWorld"] = view_cfg["stride_world"]
            meta["walkMode"] = "procedural-front"
            meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        return

    if args.mode == "ai-ref":
        ag.require_art_api_key("动画帧生图")

    if not args.base or not Path(args.base).is_file():
        sys.exit("generate 需要有效的 --base 基准图")

    base = _prepare_base_frame(Path(args.base), args.frame_size)
    ref_stats = afp.analyze_frame(base)
    print(f"基准帧: 面积={ref_stats.area}, 高度={ref_stats.bbox[3]-ref_stats.bbox[1]}, 连通域={ref_stats.blob_count}")

    action = args.action.strip()
    frame_count = max(1, args.frames)
    view_cfg = _resolve_view_config(getattr(args, "view", "front"), frame_count)
    print(f"视角模式: {view_cfg['view']}（主关/top-down 请用 front）")

    pose_hints = args.poses or []
    if not pose_hints:
        if action == "walk":
            if frame_count == 2:
                pose_hints = list(view_cfg["contact_poses"])
            elif view_cfg["view"] == "front":
                pose_hints = list(WALK_CONTACT_POSES_FRONT) * (frame_count // 2 + 1)
            else:
                pose_hints = list(WALK_POSE_HINTS)
        else:
            pose_hints = [f"{action} frame"] * frame_count
    while len(pose_hints) < frame_count:
        pose_hints.append(pose_hints[-1])

    subject = args.subject or SUBJECT_PRESETS.get(args.id) or "pixel art game sprite, dark fantasy monster"
    style = view_cfg["style"] if action == "walk" else ag.MONSTER_TEXTURE_STYLE_TEMPLATE

    side_base = None
    if action == "walk" and args.mode == "ai-ref" and view_cfg["needs_side_base"]:
        side_cache = ANIM_FOLDER / args.id / "side_base.png"
        if side_cache.is_file() and not args.regenerate_side:
            Image = _load_pil()
            side_base = Image.open(side_cache).convert("RGBA")
            print(f"复用侧视基准: {side_cache.relative_to(PROJECT_ROOT)}")
        else:
            print("生成侧视基准（正面 →  strict side profile）…")
            side_base = _try_generate_side_base(
                ag, base, ref_stats, subject, args.frame_size, style, args.id
            )
            if side_base is None:
                if args.no_fallback:
                    sys.exit("侧视基准生成失败")
                print("  → 无法生成侧视基准，仍用正面参考（walk 质量可能较差）")
                side_base = base.copy()
            else:
                side_cache.parent.mkdir(parents=True, exist_ok=True)
                side_base.save(side_cache, "PNG")
                print(f"  已保存 {side_cache.relative_to(PROJECT_ROOT)}")

    anim_ref = side_base if side_base is not None else base
    anim_stats = afp.analyze_frame(anim_ref)
    frames = [base.copy()] if not args.skip_base_idle else []
    prev_frame = base if view_cfg["view"] == "front" else anim_ref

    walk_pose_per_frame: List = []
    walk_body_strip = None
    walk_leg_strip = None
    if action == "walk" and args.mode == "ai-ref" and getattr(args, "walk_ref", None):
        walk_pose_per_frame, walk_body_strip, walk_leg_strip = _load_walk_pose_ref_frames(
            Path(args.walk_ref), args.frame_size
        )
        if walk_pose_per_frame:
            print(f"已加载 walk 姿势逐帧参考 {len(walk_pose_per_frame)} 张")
        elif walk_leg_strip is not None:
            print(f"已加载 walk 腿部姿势条: {Path(args.walk_ref).name}")
        elif walk_body_strip is not None:
            print(f"已加载 walk 全身姿势条: {Path(args.walk_ref).name}")
        else:
            print(f"警告: --walk-ref 未解析到有效参考: {args.walk_ref}")

    for idx in range(frame_count):
        pose = pose_hints[idx]
        print(f"生成 walk 帧 {idx + 1}/{frame_count}: {pose[:72]}…")
        frame = None
        walk_pose_ref, walk_pose_label = _pick_walk_pose_ref(
            idx, frame_count, walk_pose_per_frame, walk_body_strip, walk_leg_strip
        )
        if args.mode == "ai-ref":
            frame = _try_generate_walk_frame(
                ag,
                base,
                anim_ref,
                anim_stats,
                prev_frame,
                subject,
                action,
                pose,
                args.frame_size,
                style,
                idx,
                args.id,
                frame_count,
                view_cfg["view"],
                view_cfg["prompt_suffix"],
                walk_pose_ref=walk_pose_ref,
                walk_pose_label=walk_pose_label,
            )
        if frame is None:
            if args.mode == "ai-ref" and args.no_fallback:
                sys.exit(f"AI 生帧失败: walk 帧 {idx + 1}/{frame_count}")
            print(f"  → 回退程序化正面拆腿 walk")
            frame = _procedural_front_walk_frame(base, idx, args.frame_size) if view_cfg["view"] == "front" else _procedural_walk_frame(anim_ref, args.frame_size, idx, frame_count)
        prev_frame = frame
        frames.append(frame)

    if args.save_frames:
        fr_dir = ANIM_FOLDER / args.id / "frames"
        fr_dir.mkdir(parents=True, exist_ok=True)
        for i, fr in enumerate(frames):
            fr.save(fr_dir / f"frame_{i:03d}.png", "PNG")

    walk_fps = 6 if frame_count == 2 else 8
    animations = {
        "idle": {"frames": [0], "fps": 4, "loop": True},
        "walk": {"frames": list(range(1, len(frames))), "fps": walk_fps, "loop": True},
    }
    pack_frames(frames, args.id, frame_size=args.frame_size, animations=animations, reference=anim_ref)

    meta_path = ANIM_FOLDER / f"{args.id}.json"
    if meta_path.is_file():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        meta["view"] = view_cfg["view"]
        meta["strideWorld"] = view_cfg["stride_world"]
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Pixel Eternal 精灵动画管线")
    sub = p.add_subparsers(dest="command", required=True)

    pack = sub.add_parser("pack", help="将帧目录拼成 sprite sheet")

    ext = sub.add_parser("extract-gif", help="GIF 拆帧 → sprite sheet + AI walk 姿势参考")
    ext.add_argument("--input", help="GIF 路径（默认 asset/player.gif）")
    ext.add_argument("--id", default="player_walk_ref", help="输出 id / 目录名")
    ext.add_argument("--frame-size", type=int, default=DEFAULT_FRAME_SIZE)
    ext.add_argument("--idle-frame", type=int, default=0, help="哪一帧当作 idle（默认 0）")
    ext.add_argument("--frames", help="只提取指定帧，逗号分隔，如 0,2,4,6")
    ext.add_argument("--pose-samples", type=int, default=6, help="姿势条采样关键帧数（0=不生成）")
    ext.add_argument("--pose-thumb", type=int, default=96, help="姿势条每格缩略图边长")
    ext.add_argument("--walk-fps", type=int, default=8)
    ext.add_argument("--save-frames", action="store_true", help="保存逐帧 PNG")

    pack.add_argument("frames_dir")
    pack.add_argument("--id", required=True)
    pack.add_argument("--frame-size", type=int, default=DEFAULT_FRAME_SIZE)
    pack.add_argument("--anim-json")

    demo = sub.add_parser("demo-from-static", help="程序化 walk（一致性最高）")
    demo.add_argument("base")
    demo.add_argument("--id", required=True)
    demo.add_argument("--frame-size", type=int, default=DEFAULT_FRAME_SIZE)
    demo.add_argument("--walk-frames", type=int, default=4)
    demo.add_argument("--save-frames", action="store_true")

    gen = sub.add_parser("generate", help="AI 参考图生帧 + 校验 + 程序化回退")
    gen.add_argument("--id", required=True)
    gen.add_argument("--base", help="基准 idle 图")
    gen.add_argument("--subject", help="角色英文描述")
    gen.add_argument("--action", default="walk")
    gen.add_argument("--frames", type=int, default=4)
    gen.add_argument("--frame-size", type=int, default=DEFAULT_FRAME_SIZE)
    gen.add_argument("--poses", nargs="*")
    gen.add_argument("--skip-base-idle", action="store_true")
    gen.add_argument("--save-frames", action="store_true")
    gen.add_argument(
        "--view",
        choices=("front", "side"),
        default="front",
        help="front=正面/top-down 主关视角（默认）；side=侧视",
    )
    gen.add_argument(
        "--regenerate-side",
        action="store_true",
        help="强制重新生成侧视基准（默认复用 asset/animations/{id}/side_base.png）",
    )
    gen.add_argument(
        "--no-fallback",
        action="store_true",
        help="ai-ref 模式下任一生帧失败则中止，不回退程序化变形",
    )
    gen.add_argument(
        "--walk-ref",
        help="walk 姿势参考：walk_leg_pose_ref.png、walk_ref.json 或含 walk_frames/ 的目录",
    )
    gen.add_argument(
        "--mode",
        choices=("ai-ref", "procedural", "procedural-front"),
        default="ai-ref",
        help="ai-ref=AI 生帧；procedural-front=正面拆腿（主关推荐）；procedural=侧视占位",
    )
    return p


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    if args.command == "pack":
        cmd_pack(args)
    elif args.command == "extract-gif":
        cmd_extract_gif(args)
    elif args.command == "demo-from-static":
        cmd_demo_from_static(args)
    elif args.command == "generate":
        cmd_generate(args)


if __name__ == "__main__":
    main()
