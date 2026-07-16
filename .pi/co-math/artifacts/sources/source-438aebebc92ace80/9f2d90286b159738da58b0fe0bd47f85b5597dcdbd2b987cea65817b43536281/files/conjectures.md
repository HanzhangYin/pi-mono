# Conjectural content of arXiv:0809.2981v2

## Bibliographic identification

- **Title:** Presenting the cohomology of a Schubert variety
- **Authors:** Victor Reiner, Alexander Woo, Alexander Yong
- **arXiv:** [0809.2981v2](https://arxiv.org/abs/0809.2981v2)
- **Journal:** *Transactions of the American Mathematical Society* 363 (2011), 521–543

## 1. The formally stated conjecture

### Minimality conjecture

For a type-\(A_{n-1}\) bigrassmannian permutation \(v=v_{r,s,t,n}\), Theorem 5.4 supplies two generating sets for the ideal \(J_v\). The authors conjecture:

> **Conjecture.** The two generating sets for the ideal \(J_{v_{r,s,t,n}}\) given in Theorem 5.4 are both minimal.

Here, if \(\mathfrak S_v=s_{i^j}\), the parameters are

\[
a=\min(n-r-i,r-j),\qquad b=\min(i,j).
\]

Theorem 5.4 gives the two sets

\[
\{s_\mu:i^j\subseteq\mu\subseteq((i+a)^b,i^{j-b})\}
\]

and

\[
\{s_\mu:i^j\subseteq\mu\subseteq(i^j,b^a)\}.
\]

Each contains

\[
\binom{a+b}{a}
\]

generators. “Minimal” means that no proper subset still generates \(J_v\).

**Primary-source location:** `sources/0809.2981v2.tex`, lines 1380–1421 and 1489–1499.

## 2. Evidence reported by the authors

The authors state that they verified the conjecture computationally for all bigrassmannian permutations satisfying

\[
r\leq 4,\qquad n-r\leq 5.
\]

**Primary-source location:** lines 1501–1502.

## 3. Stronger suspected formulation

Set \(M=J_{v_{r,s,t,n}}\), and let \(\Lambda_+\) denote the positive-degree part of the ring of symmetric functions. The authors further conjecture that

\[
M/\Lambda_+M
\]

requires \(\binom{a+b}{a}\) generators. They suspect the stronger structural statement

\[
M/\Lambda_+M\cong\mathbb Z^{\binom{a+b}{a}}.
\]

This is presented in prose rather than as a second numbered conjecture. The authors write that a proof had eluded them.

**Primary-source location:** lines 1517–1552.

## 4. Consequence of the conjecture

Take \(n=4m\) and the family for which \(a=b=m\). If the minimality conjecture is true, the corresponding ideal requires

\[
\binom{2m}{m}
\sim \frac{4^m}{\sqrt{\pi m}}
=\frac{\sqrt{2}^{\,n+2}}{\sqrt{\pi n}}
\]

generators. This gives an exponential lower bound and shows that uniformly short presentations of \(H^*(X_w)\) cannot be expected in general, even in type \(A\).

**Primary-source location:** lines 1504–1515; see also the introductory discussion at lines 355–364.

## 5. Related open question

The final section asks:

> Can one find a minimal generating set for the ideal \(I_w\) in type \(A_{n-1}\)?

The authors ask whether this can at least be done for subclasses already known to admit generating sets of size \(n^2\), including:

1. Schubert varieties defined by inclusions, characterized there by avoidance of
   \(\{4231,35142,42513,351624\}\);
2. smooth Schubert varieties, characterized by avoidance of \(\{3412,4231\}\).

This is an open question, not another formally labeled conjecture.

**Primary-source location:** lines 1897–1935.

## Classification summary

| Item | Status in the paper |
|---|---|
| Minimality of both Theorem 5.4 generating sets for \(J_v\) | Formally labeled conjecture |
| \(M/\Lambda_+M\cong\mathbb Z^{\binom{a+b}{a}}\) | Stronger suspected statement in prose |
| Minimal generating sets for general \(I_w\) in type \(A\) | Formally labeled open question |
