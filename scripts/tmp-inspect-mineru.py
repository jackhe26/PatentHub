#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""查看 MinerU ZIP 中的文件结构和 model.json 内容"""
import zipfile
import json
import sys
from pathlib import Path

zip_path = Path(r"F:\MyAI_Labs\Patent-AI\PDF-Tests-Files\WOSA_PCT_mineru_20260620_001753.zip")

if not zip_path.exists():
    print(f"ZIP not exist: {zip_path}")
    sys.exit(1)

print(f"ZIP: {zip_path.name} ({zip_path.stat().st_size / 1024:.1f} KB)")
print("=" * 70)

with zipfile.ZipFile(zip_path, 'r') as z:
    for info in z.infolist():
        print(f"  {info.filename:60s} {info.file_size:>10,} bytes")

print()
print("=" * 70)

with zipfile.ZipFile(zip_path, 'r') as z:
    model_files = [n for n in z.namelist() if n.endswith('model.json')]
    if not model_files:
        print("No model.json")
        sys.exit(1)

    model_file = model_files[0]
    print(f"Reading: {model_file}")

    data = json.loads(z.read(model_file))

    if isinstance(data, dict):
        print(f"Top keys: {list(data.keys())[:20]}")
        for key in list(data.keys())[:8]:
            val = data[key]
            if isinstance(val, list):
                print(f"  - {key}: list[{len(val)}]")
            elif isinstance(val, dict):
                print(f"  - {key}: dict, keys={list(val.keys())[:10]}")
            else:
                print(f"  - {key}: {type(val).__name__} = {str(val)[:80]}")

    if 'pdf_info' in data:
        pdf_info = data['pdf_info']
        print(f"\npdf_info keys: {list(pdf_info.keys())[:20]}")
        if 'pages' in pdf_info:
            pages = pdf_info['pages']
            print(f"pages count: {len(pages)}")
            if pages:
                page0 = pages[0]
                print(f"page[0] keys: {list(page0.keys())[:20]}")
                if 'page_size' in page0:
                    print(f"page_size: {page0['page_size']}")
                if 'preproc_blocks' in page0:
                    blocks = page0['preproc_blocks']
                    print(f"preproc_blocks count: {len(blocks)}")
                    if blocks:
                        print(f"\nblock[0]:")
                        print(json.dumps(blocks[0], ensure_ascii=False, indent=2)[:1500])
                elif 'blocks' in page0:
                    blocks = page0['blocks']
                    print(f"blocks count: {len(blocks)}")
                    if blocks:
                        print(f"\nblock[0]:")
                        print(json.dumps(blocks[0], ensure_ascii=False, indent=2)[:1500])

    if 'pages' in data and isinstance(data['pages'], list):
        pages = data['pages']
        print(f"\npages count: {len(pages)}")
        if pages:
            page0 = pages[0]
            print(f"page[0] keys: {list(page0.keys())[:20]}")

    # 打印原始数据前 3000 字符
    print("\n=== RAW data[0:3000] ===")
    print(json.dumps(data, ensure_ascii=False, indent=2)[:3000])