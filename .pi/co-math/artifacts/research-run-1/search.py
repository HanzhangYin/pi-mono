from math import isqrt
from collections import Counter, defaultdict

N = 200

def is_prime(m):
    if m < 2:
        return False
    if m % 2 == 0:
        return m == 2
    d = 3
    while d <= isqrt(m):
        if m % d == 0:
            return False
        d += 2
    return True

def factor(m):
    out = []
    d = 2
    while d <= isqrt(m):
        if m % d == 0:
            e = 0
            while m % d == 0:
                m //= d
                e += 1
            out.append((d, e))
        d += 1 if d == 2 else 2
    if m > 1:
        out.append((m, 1))
    return out

def fmt_factor(fac):
    parts = []
    for p, e in fac:
        parts.append(str(p) if e == 1 else f"{p}^{e}")
    return " * ".join(parts)

prime_rows = []
composite_rows = []
spf_counter = Counter()
residue_hits = defaultdict(list)

for n in range(1, N + 1):
    v = n*n + 1
    if is_prime(v):
        prime_rows.append((n, v))
    else:
        fac = factor(v)
        composite_rows.append((n, v, fac))
        spf_counter[fac[0][0]] += 1

# Visible congruence patterns: if p | n^2+1, record residues n mod p.
small_primes = [5, 13, 17, 29, 37, 41, 53, 61, 73, 89, 97]
for p in small_primes:
    residues = sorted({n % p for n in range(1, N + 1) if (n*n + 1) % p == 0})
    if residues:
        residue_hits[p] = residues

print(f"Finite experiment for n^2 + 1 with checked range 1 <= n <= {N}")
print("Finite output is evidence for pattern-finding only; it is not proof of any infinite statement.")
print()

print(f"Prime-producing n: {len(prime_rows)} out of {N}")
print("n -> n^2 + 1")
for n, v in prime_rows:
    print(f"{n:3d} -> {v}")

print()
eligible = [n for n in range(1, N + 1) if n == 1 or n % 2 == 0]
eligible_primes = [n for n, _ in prime_rows if n in eligible]
print(f"Parity obstruction: every odd n > 1 gives even n^2+1 > 2, hence composite.")
print(f"Eligible n count, using only n=1 or even n: {len(eligible)}")
print(f"Prime rate among all n: {len(prime_rows)}/{N} = {len(prime_rows)/N:.3f}")
print(f"Prime rate among eligible n: {len(eligible_primes)}/{len(eligible)} = {len(eligible_primes)/len(eligible):.3f}")

print()
print("First composite examples, factored:")
shown = 0
for n, v, fac in composite_rows:
    if shown >= 18:
        break
    print(f"{n:3d} -> {v:<7d} = {fmt_factor(fac)}")
    shown += 1

print()
print("Most common smallest prime divisors among composites:")
for p, c in spf_counter.most_common(10):
    print(f"{p:3d}: {c}")

print()
print("Visible congruence patterns: residues r with p | r^2+1")
for p, residues in residue_hits.items():
    print(f"mod {p:3d}: r in {residues}")