# Co-Math Path 5 Source Test Pack

Use these as user-provided source notes after the source-ingestion milestone is implemented. They are intentionally conservative: they give conjectural context, not a proof of the original claim.

## Source note 1: Schinzel-style conjectural context

Suggested prompt to paste into Pi:

```text
I found a reference: Schinzel's hypothesis H is a conjectural framework predicting prime values for suitable systems of irreducible integer polynomials. It would give conjectural context for questions like whether n^2 + 1 is prime infinitely often, but it is not an unconditional theorem and does not by itself prove the original claim.
```

Expected Path 5 classification:

```text
partially-supported: conjectural prime-values-of-polynomials context
unsupported: unconditional proof of infinitely many primes of the form n^2 + 1
```

## Source note 2: Bunyakovsky-style conjectural context

Suggested prompt to paste into Pi:

```text
Register this reference: Bunyakovsky's conjecture predicts that an irreducible integer polynomial with positive leading coefficient and no fixed prime divisor should take infinitely many prime values. This is conjectural context for f(n) = n^2 + 1, not a proved theorem establishing infinitely many primes of that form.
```

Expected Path 5 classification:

```text
partially-supported: conjectural framing for prime values of polynomials
unsupported: unconditional proof for n^2 + 1
```

## Source note 3: Landau/open-problem framing

Suggested prompt to paste into Pi:

```text
Use this source for path 5: The question of whether there are infinitely many primes of the form n^2 + 1 is commonly presented as an open problem related to Landau's problems and prime-producing polynomials. This source note should be used as open-problem context only; it does not contain a proof.
```

Expected Path 5 classification:

```text
partially-supported: open-problem/literature framing
unsupported: source contains a proof of the infinitude claim
```

## Full manual smoke after implementation

```text
Are there infinitely many primes of the form n^2 + 1?
I found a reference: Schinzel's hypothesis H is a conjectural framework predicting prime values for suitable systems of irreducible integer polynomials. It would give conjectural context for questions like whether n^2 + 1 is prime infinitely often, but it is not an unconditional theorem and does not by itself prove the original claim.
continue path 5
show report
```

Good signs:

```text
- source registered
- Path 5 does not say no source was available
- conjectural context is partially-supported
- unconditional proof is unsupported
- original problem is not claimed proved
```
