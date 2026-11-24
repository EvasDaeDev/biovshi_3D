#!/usr/bin/env python3
"""Build a separate full project from biovshi main plus this 3D starter package."""
from __future__ import annotations
import argparse, pathlib, subprocess, shutil, tempfile, sys

HERE=pathlib.Path(__file__).resolve().parent.parent
DEFAULT_REF='main'
URL='https://github.com/EvasDaeDev/biovshi.git'

def run():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--output',default='../ECCEPRY_3D_PROJECT')
 p.add_argument('--source',help='Existing local checkout of biovshi (offline mode)')
 p.add_argument('--ref',default=DEFAULT_REF,help='Branch or exact commit in original repository')
 a=p.parse_args()
 out=pathlib.Path(a.output).expanduser().resolve()
 if out.exists():
  raise SystemExit(f'Output already exists (will NOT overwrite): {out}')
 if out==HERE or HERE in out.parents:
  raise SystemExit('Output must be outside starter folder')
 if a.source:
  src=pathlib.Path(a.source).expanduser().resolve()
  if not (src/'src'/'game'/'loop.js').is_file() or not (src/'package.json').is_file():
   raise SystemExit('Invalid --source: expected original biovshi checkout')
  if src==out or out in src.parents:raise SystemExit('Output must be outside source')
  temp=None
 else:
  temp=tempfile.TemporaryDirectory(prefix='eccepry-main-')
  src=pathlib.Path(temp.name)/'biovshi'
  try:
   subprocess.run(['git','clone','--no-checkout',URL,str(src)],check=True)
   subprocess.run(['git','-C',str(src),'checkout',a.ref],check=True)
  except (subprocess.CalledProcessError, FileNotFoundError) as e:
   temp.cleanup()
   raise SystemExit(f'Cannot obtain original repo: {e}. Use --source for offline mode.')
 try:
  shutil.copytree(src,out,ignore=shutil.ignore_patterns('.git','node_modules','dist','.cache'))
  if (out/'3d').exists():
   raise RuntimeError('Source already contains 3d; refusing to overwrite')
  shutil.copytree(HERE/'3d',out/'3d')
  (out/'docs'/'3d-migration').mkdir(parents=True,exist_ok=True)
  shutil.copy2(HERE/'README.md',out/'docs'/'3d-migration'/'START_HERE.md')
  (out/'scripts').mkdir(exist_ok=True)
  shutil.copy2(HERE/'scripts'/'export_3d.py',out/'scripts'/'export_3d.py')
  print('Created:',out)
  print('Original game preserved. New page: /3d/lab/')
 except Exception:
  if out.exists():shutil.rmtree(out)
  raise
 finally:
  if temp is not None:temp.cleanup()

if __name__=='__main__':run()
