claimed = {1,2,4,6,10,14,16,20,24,26,36,40,54,56,66,74,84,90,94}

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

for n in range(1, 101):
    actual = is_prime(n*n + 1)
    listed = n in claimed
    if actual != listed:
        print("mismatch at n =", n, "n^2+1 =", n*n+1)
        counterexample = True

print("counterexample_found:", "true" if counterexample else "false")