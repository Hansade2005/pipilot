#!/usr/bin/env python3
# matte.py — background matting for talking-avatar presenters.
#   python3 matte.py <input_image> <output_alpha_png>
# Runs U^2-Net (u2net.onnx) via onnxruntime (CPU) and writes a GRAYSCALE alpha mask
# (white = person, black = background) at the input's native size. The engine applies
# this ONE mask to the whole Wav2Lip clip — valid because Wav2Lip only moves the mouth,
# so the person's silhouette is constant across every frame (compute once, apply to all).
# Deliberately depends on onnxruntime + numpy + Pillow only (already present for Wav2Lip),
# NOT the rembg package, whose transitive deps would upgrade numpy and break Wav2Lip.
import sys
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageFilter

MODEL = "/opt/u2net/u2net.onnx"


def main():
    if len(sys.argv) < 3:
        print("usage: matte.py <input> <output_alpha_png>", file=sys.stderr)
        sys.exit(2)
    src, dst = sys.argv[1], sys.argv[2]
    img = Image.open(src).convert("RGB")
    w, h = img.size

    # U^2-Net expects 320x320, per-channel normalized (ImageNet mean/std) on 0..1.
    r = img.resize((320, 320), Image.BILINEAR)
    a = np.asarray(r).astype(np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    a = (a - mean) / std
    a = a.transpose(2, 0, 1)[None].astype(np.float32)  # NCHW

    sess = ort.InferenceSession(MODEL, providers=["CPUExecutionProvider"])
    out = sess.run(None, {sess.get_inputs()[0].name: a})[0]  # d0 salient map
    m = out[0, 0]
    m = (m - m.min()) / (m.max() - m.min() + 1e-8)

    mask = Image.fromarray((m * 255.0).astype(np.uint8)).resize((w, h), Image.BILINEAR)
    # A tiny feather softens the cutout edge so hair/shoulders don't look razor-cut.
    mask = mask.filter(ImageFilter.GaussianBlur(radius=max(1, min(w, h) // 400)))
    mask.save(dst)


if __name__ == "__main__":
    main()
