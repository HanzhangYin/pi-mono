from math import isqrt
from collections import Counter, defaultdict

N = 100

def is_prime(m):
    if m < 2:
        return False
    if m == 2:
        return True
    if m % 2 == 0:
        return False
    for d in range(3, isqrt(m) + 1, 2):
        if m % d == 0:
            return False
    return True

def least_prime_divisor(m):
    if m % 2 == 0:
        return 2
    for d in range(3, isqrt(m) + 1, 2):
        if m % d == 0:
            return d
    return m

prime_ns = []
composite_lpd = []
divisor_residues = defaultdict(list)

print(f"Checked range: n = 1..{N}")
print("Finite evidence only; no infinite conclusion is implied.\n")

print(f"{'n':>3} {'n^2+1':>7} {'status':>10} {'least prime divisor':>20}")
print("-" * 46)

for n in range(1, N + 1):
    m = n * n + 1
    if is_prime(m):
        prime_ns.append(n)
        print(f"{n:3d} {m:7d} {'prime':>10} {'-':>20}")
    else:
        lpd = least_prime_divisor(m)
        composite_lpd.append(lpd)
        divisor_residues[lpd].append(n % lpd)
        print(f"{n:3d} {m:7d} {'composite':>10} {lpd:20d}")

print("\nPrime-producing n:")
print(prime_ns)
print(f"Count: {len(prime_ns)} out of {N}")

print("\nLeast prime divisor frequencies for composites:")
for p, c in sorted(Counter(composite_lpd).items()):
    print(f"{p:3d}: {c}")

print("\nVisible modular patterns in this finite range:")
odd_composite = all((n == 1 or not is_prime(n*n + 1)) for n in range(1, N + 1, 2))
print(f"- Every odd n > 1 gives even n^2+1 > 2, hence composite: observed={odd_composite}")

for p in sorted(divisor_residues):
    residues = sorted(set(divisor_residues[p]))
    if p <= 50:
        print(f"- When least divisor is {p}, observed n mod {p}: {residues}")

print("\nNotes:")
print("- Divisors appearing are consistent with the congruence n^2 ≡ -1 mod p.")
print("- For odd prime divisors p observed here, p is 1 mod 4.")
print("- These are bounded computations for pattern-finding, not proof.")