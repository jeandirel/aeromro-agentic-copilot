"""Vercel entrypoint: exposes the FastAPI app from the ``src/`` layout.

Vercel loads ``app`` from this file (see ``[tool.vercel]`` in ``pyproject.toml``). The package
imports itself as ``aeromro``, so ``src/`` goes on the path in case the build did not install
the project. AWS Lambda does not use this file; it runs ``uvicorn aeromro.api.app:app``.
"""

import sys
from pathlib import Path

_SRC = Path(__file__).resolve().parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from aeromro.api.app import app  # noqa: E402

__all__ = ["app"]
