import math

def primes_upto(n):
    s = bytearray(b'\x01')*(n+1)
    s[:2] = b'\x00\x00'
    for i in range(2, int(n**0.5)+1):
        if s[i]:
            s[i*i:n+1:i] = b'\x00'*(((n-i*i)//i)+1)
    return [i for i in range(n+1) if s[i]]

B = 10000
ps = primes_upto(B)
relevant = [2] + [p for p in ps if p % 4 == 1]
logdens = math.log(0.5)
for p in relevant:
    if p != 2:
        logdens += math.log1p(-2/p)
print('B', B)
print('relevant_prime_count_including_2', len(relevant))
print('largest_relevant_prime', relevant[-1])
print('uncovered_density_float', math.exp(logdens))
print('uncovered_density_positive_for_finite_set', True)

# sieve n in [1,N] avoiding all congruences n^2 == -1 mod p for relevant p<=B
N = 200000
ok = bytearray(b'\x01')*(N+1)
# p=2: n odd gives n^2+1 even; exclude odds if looking for no p<=B divisor
for n in range(1, N+1, 2):
    ok[n] = 0
for p in relevant:
    if p == 2:
        continue
    roots = [r for r in range(p) if (r*r + 1) % p == 0]
    for r in roots:
        start = r if r else p
        for n in range(start, N+1, p):
            ok[n] = 0
survivors = [n for n in range(1, N+1) if ok[n]]
print('N', N, 'survivor_count', len(survivors))
print('first_20_survivors', survivors[:20])
print('first_10_values_n2_plus_1', [(n, n*n+1) for n in survivors[:10]])