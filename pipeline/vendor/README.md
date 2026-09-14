`bertalign_core.py` is an unmodified copy of `bertalign/corelib.py` from
https://github.com/bfsujason/bertalign at df8c63f51aa203faed9f2fe45ae39e6fca75e667.
Its GPL-3.0 licence is retained in BERTALIGN_LICENSE. The pipeline wrapper is
GPL-3.0-or-later. This small vendored core avoids upstream's import-time model
initialisation and online Google language detection. The two-pass alignment
algorithm itself is unchanged. Our wrapper supplies explicit en/fr segmentation,
a pinned LaBSE model, and CPU FAISS. No Google translation service is used.
