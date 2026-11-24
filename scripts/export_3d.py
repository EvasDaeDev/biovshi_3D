#!/usr/bin/env python3
"""Export self-contained 3D HTML+JS lab folder (libraries still loaded via CDN)."""
from pathlib import Path
import argparse, shutil
p=argparse.ArgumentParser();p.add_argument('--output',default='../eccepry_3d_dist');a=p.parse_args()
root=Path(__file__).resolve().parent.parent
out=Path(a.output).resolve()
if out.exists(): raise SystemExit(f'Refusing to overwrite {out}')
shutil.copytree(root/'3d'/'lab',out)
print('Exported:',out)
