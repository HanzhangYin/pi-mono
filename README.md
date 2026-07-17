# Bigrassmannian Minimality Conjecture

This repository contains a self-contained mathematical synthesis of the
minimality conjecture from Reiner--Woo--Yong, *Presenting the cohomology of a
Schubert variety*.

The main document is `minimality-conjecture.tex`. It records:

- the original conjecture and its significance;
- the published 2024 minimality theorem for the lower-adjoined family;
- a complete partition-conjugation proof for the second family;
- the integral indecomposables basis and Hilbert series;
- accepted auxiliary formulas and bounded computational audits;
- the Co-Math evidence and independent-review provenance;
- results that are deliberately not claimed.

The research state and content-addressed evidence are preserved in the
`comath/research-exploration-mode` branch of
`HanzhangYin/pi-mono`, commit `ace829d7`.

To build the document with a standard TeX installation:

```sh
pdflatex minimality-conjecture.tex
pdflatex minimality-conjecture.tex
```

The proof is source-grounded and independently reviewed by Co-Math, but it has
not been formalized in a proof assistant.
