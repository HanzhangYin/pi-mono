# Length-4 permutation-pattern avoidance counts for n <= 7

Question: count permutations of length `n` avoiding one fixed length-4 pattern, for every pattern in `S_4`, for `0 <= n <= 7`.

## Method

Two finite exhaustive computations were run over all permutations of `[n]` and all 24 patterns:

1. `itertools.permutations` plus `itertools.combinations` of positions, standardizing each selected quadruple.
2. `itertools.permutations` plus explicit nested index loops and direct rank computation of each quadruple.

The two methods agreed for all `24 * 8 = 192` pattern/length pairs. Source and machine-readable output are stored in this co-math artifact directory.

## Counts by observed class

The list in each row is indexed by `n = 0,1,2,3,4,5,6,7`.

| Avoided patterns | Counts |
|---|---|
| 1342, 1423, 2314, 2413, 2431, 3124, 3142, 3241, 4132, 4213 | 1, 1, 2, 6, 23, 103, 512, 2740 |
| 1234, 1243, 1432, 2134, 2143, 2341, 3214, 3412, 3421, 4123, 4312, 4321 | 1, 1, 2, 6, 23, 103, 513, 2761 |
| 1324, 4231 | 1, 1, 2, 6, 23, 103, 513, 2762 |

## Finite claims

- For every length-4 pattern `p`, the file `length4_avoidance_counts_n_le_7.json` gives the validated exact number of `p`-avoiding permutations for each `0 <= n <= 7`.
- The observed equality classes through `n=7` are exactly the three rows above.
- These are finite exhaustive claims only; no asymptotic or all-`n` Wilf-equivalence claim is made here.

## Warnings

- The two validation methods are not fully independent implementations: both enumerate all permutations and scan quadruples. They reduce indexing/ranking mistakes but share the same brute-force scope.
- Counts include `n=0` as the empty permutation count `1`.
- The computation is small (`7! * 24` top-level avoidance checks), so provenance overhead was noticeable relative to computation time.

## Computation provenance assessment

For this task, recording scripts, hashes, claims, warnings, review, and a paper export by hand was cumbersome enough to justify a dedicated `/comath computation` workflow. The mathematical computation itself is tiny; most effort was provenance bookkeeping.
