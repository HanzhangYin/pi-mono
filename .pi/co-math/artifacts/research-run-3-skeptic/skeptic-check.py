def is_prime(m):
    if m < 2:
        return False
    if m % 2 == 0:
        return m == 2
    d = 3
    while d * d <= m:
        if m % d == 0:
            return False
        d += 2
    return True

counterexample = False

# Check: odd prime divisors of n^2+1 are 1 mod 4.
for n in range(1, 301):
    v = n*n + 1
    for p in range(3, v + 1, 2):
        if p * p > v:
            if v > 1 and is_prime(v) and v % 4 != 1:
                counterexample = True
            break
        if v % p == 0 and is_prime(p) and p % 4 != 1:
            counterexample = True
            break
    if counterexample:
        print("bad odd divisor at n =", n)
        break

# Check root counts modulo small primes.
if not counterexample:
    for p in range(2, 100):
        if is_prime(p):
            roots = 0
            for a in range(p):
                if (a*a + 1) % p == 0:
                    roots += 1
            expected = 1 if p == 2 else (2 if p % 4 == 1 else 0)
            if roots != expected:
                print("bad root count for p =", p, "roots =", roots)
                counterexample = True
                break

# Check finite-set avoidance for subsets of small primes.
small_primes = [2, 3, 5, 7, 11, 13, 17, 19]
if not counterexample:
    for mask in range(1 << len(small_primes)):
        S = []
        n = 1
        for i, p in enumerate(small_primes):
            if mask & (1 << i):
                S.append(p)
                n *= p
        v = n*n + 1
        for p in S:
            if v % p == 0:
                print("finite-set avoidance failed:", S, "n =", n)
                counterexample = True
                break
        if counterexample:
            break

print("counterexample_found:", "true" if counterexample else "false")