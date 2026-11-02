#!/usr/bin/env python3
"""Create reproducible, versioned install/source/docs archives for Runyth Sleep."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ID = 'runyth-sleep'
STAMP = (2026, 10, 25, 19, 0, 0)
INSTALL_ITEMS = ('module.json', 'scripts', 'styles', 'languages', 'templates', 'assets', 'LICENSE', 'README.md', 'THIRD_PARTY_NOTICES.md')
DOC_ITEMS = ('README.md', 'CHANGELOG.md', 'docs', 'LICENSE', 'THIRD_PARTY_NOTICES.md')


def command(*args: str) -> str:
  return subprocess.check_output(args, cwd=ROOT, text=True).strip()


def files_under(items: tuple[str, ...]) -> list[Path]:
  paths: list[Path] = []
  for item in items:
    path = ROOT / item
    if not path.exists():
      raise RuntimeError(f'Missing required release path: {item}')
    if path.is_file():
      paths.append(path)
    else:
      paths += [file for file in path.rglob('*') if file.is_file()]
  return sorted(set(paths), key=lambda path: path.relative_to(ROOT).as_posix())


def add_file(archive: zipfile.ZipFile, name: str, data: bytes) -> None:
  info = zipfile.ZipInfo(name, STAMP)
  info.compress_type = zipfile.ZIP_DEFLATED
  info.external_attr = 0o100644 << 16
  archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def sha256(path: Path) -> str:
  digest = hashlib.sha256()
  with path.open('rb') as source:
    for block in iter(lambda: source.read(1024 * 1024), b''):
      digest.update(block)
  return digest.hexdigest()


def pack(output: Path, prefix: str, paths: list[Path], extras: dict[str, bytes] | None = None) -> None:
  with zipfile.ZipFile(output, 'w') as archive:
    for path in paths:
      rel = path.relative_to(ROOT).as_posix()
      add_file(archive, f'{prefix}/{rel}', path.read_bytes())
    for name, content in sorted((extras or {}).items()):
      add_file(archive, f'{prefix}/{name}', content)
  with zipfile.ZipFile(output) as check:
    assert check.testzip() is None
    assert all(not name.startswith('/') and '..' not in Path(name).parts for name in check.namelist())


def main() -> int:
  manifest = json.loads((ROOT / 'module.json').read_text(encoding='utf-8'))
  package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
  version = manifest['version']
  if manifest['id'] != ID or version != package['version']:
    raise RuntimeError('Module manifest and package metadata disagree.')
  if command('git', 'status', '--porcelain'):
    raise RuntimeError('Commit all changes before building an auditable release.')
  if command('git', 'describe', '--tags', '--exact-match') != f'v{version}':
    raise RuntimeError('The committed HEAD must have the matching version tag.')
  if not (ROOT / '.git').is_dir():
    raise RuntimeError('The source release must contain a complete .git directory, not a linked worktree.')
  print(command('npm', 'run', 'check'))

  output_dir = Path(os.environ.get('RUNYTH_RELEASE_DIR', ROOT.parent)).resolve()
  output_dir.mkdir(parents=True, exist_ok=True)
  install = output_dir / f'{ID}-v{version}.zip'
  source = output_dir / f'{ID}-source-v{version}.zip'
  docs = output_dir / f'{ID}-documentation-v{version}.zip'

  tracked = [ROOT / path for path in command('git', 'ls-files').splitlines()]
  git_files = [path for path in (ROOT / '.git').rglob('*') if path.is_file()]
  if len(git_files) < 5 or not (ROOT / '.git/HEAD').is_file():
    raise RuntimeError('Incomplete Git repository.')
  source_paths = sorted([*tracked, *git_files], key=lambda path: path.relative_to(ROOT).as_posix())
  pack(install, ID, files_under(INSTALL_ITEMS))
  pack(source, f'{ID}-source-v{version}', source_paths)
  sums = '\n'.join(f'{sha256(path)}  {path.name}' for path in (install, source)) + '\n'
  info = (
    f'Runyth Sleep v{version}\n'
    f'Git HEAD: {command("git", "rev-parse", "HEAD")}\n'
    f'Git commits: {command("git", "rev-list", "--count", "HEAD")}\n'
    f'Release tag: v{version}\n'
    'Test command: npm run check\n'
    'Note: end-to-end live Foundry validation must still be performed.\n'
  )
  pack(docs, f'{ID}-documentation-v{version}', files_under(DOC_ITEMS), {
    'SHA256SUMS.txt': sums.encode('utf-8'),
    'RELEASE_INFO.txt': info.encode('utf-8')
  })
  with zipfile.ZipFile(install) as archive:
    assert f'{ID}/module.json' in archive.namelist()
    assert not any('/.git/' in name for name in archive.namelist())
  with zipfile.ZipFile(source) as archive:
    assert f'{ID}-source-v{version}/.git/HEAD' in archive.namelist()
  with zipfile.ZipFile(docs) as archive:
    assert not any(name.endswith('/module.json') for name in archive.namelist())
  print('\nRelease artifacts:')
  for path in (install, source, docs):
    print(f'  {path} ({path.stat().st_size} bytes) SHA256={sha256(path)}')
  return 0


if __name__ == '__main__':
  try:
    sys.exit(main())
  except (RuntimeError, subprocess.CalledProcessError, AssertionError) as error:
    print(f'Release failed: {error}', file=sys.stderr)
    sys.exit(1)