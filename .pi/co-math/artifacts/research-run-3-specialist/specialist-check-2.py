from math import prod
B=200
primes=[]
for n in range(2,B+1):
    ok=True
    for d in range(2,int(n**0.5)+1):
        if n%d==0:
            ok=False; break
    if ok: primes.append(n)
# only p=2 or p=1 mod 4 can divide n^2+1 by congruence; p=3 mod4 contributes no forbidden classes
relevant=[p for p in primes if p==2 or p%4==1]
M=1
A=1
for p in relevant:
    M*=p
    forbidden = 1 if p==2 else 2
    A*=p-forbidden
print('B',B)
print('relevant_primes',relevant)
print('modulus_product_digits',len(str(M)))
print('admissible_residue_count_digits',len(str(A)))
print('admissible_residue_count_positive',A>0)
print('uncovered_density_float',A/M)
print('exact_factors_count', [(p, p-(1 if p==2 else 2), p) for p in relevant[:10]], '... total', len(relevant))