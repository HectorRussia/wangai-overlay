"""Copy upstream license texts, including vendored torch/ORT notices, into the bundle."""
import importlib.metadata
import pathlib
import shutil
import sys

destination = pathlib.Path(sys.argv[1])
destination.mkdir(parents=True, exist_ok=True)
summary = []
for dist in sorted(importlib.metadata.distributions(), key=lambda d: d.metadata['Name']):
    name = dist.metadata['Name']
    summary.append(f"{name}=={dist.version}\n{dist.metadata.get('License-Expression') or dist.metadata.get('License', '')}\n")
    for file in dist.files or []:
        if any(word in file.name.lower() for word in ('license', 'copying', 'notice')):
            source = pathlib.Path(dist.locate_file(file))
            if source.is_file():
                target = destination / name / str(file).replace('..', '_')
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, target)
(destination / 'DEPENDENCIES.txt').write_text('\n'.join(summary), encoding='utf-8')
python_license = pathlib.Path(sys.base_prefix) / 'LICENSE.txt'
if not python_license.is_file():
    raise RuntimeError('Missing Python runtime license')
shutil.copyfile(python_license, destination / 'PYTHON-LICENSE.txt')
