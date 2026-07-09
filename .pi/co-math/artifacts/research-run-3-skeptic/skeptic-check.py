def gcd(a, b):
    while b:
        a, b = b, a % b
    return abs(a)

def is_prime(n):
    if n < 2:
        return False
    d = 2
    while d * d <= n:
        if n % d == 0:
            return False
        d += 1
    return True

counterexample = False

# Test complete modular obstruction up to B.
B = 300
bad_moduli = []
for m in range(2, B + 1):
    if all(gcd(r * r + 1, m) > 1 for r in range(m)):
        bad_moduli.append(m)
        counterexample = True
        break

# Test finite-prime avoidance density for a small relevant set.
S = [p for p in range(2, 50) if is_prime(p) and (p == 2 or p % 4 == 1)][:5]
M = 1
expected = 1
for p in S:
    M *= p
    expected *= 1 if p == 2 else p - 2

allowed = 0
for r in range(M):
    ok = True
    for p in S:
        if (r * r + 1) % p == 0:
            ok = False
            break
    if ok:
        allowed += 1

if allowed != expected or allowed <= 0:
    counterexample = True

print("tested_moduli_up_to:", B)
print("bad_moduli:", bad_moduli)
print("prime_set:", S)
print("allowed_residues:", allowed)
print("expected_allowed_residues:", expected)
print("counterexample_found:", str(counterexample).lower())