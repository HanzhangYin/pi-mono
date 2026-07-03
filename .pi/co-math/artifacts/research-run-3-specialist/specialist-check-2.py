import math
N=200000
# sieve primes up to N
sieve=bytearray(b'\x01')*(N+1)
sieve[0:2]=b'\x00\x00'
for i in range(2,int(N**0.5)+1):
    if sieve[i]:
        step=i; start=i*i
        sieve[start:N+1:step]=b'\x00'*(((N-start)//step)+1)
primes=[i for i in range(2,N+1) if sieve[i]]

def isprime_m2p1(n):
    m=n*n+1
    r=math.isqrt(m)
    for p in primes:
        if p>r: return True
        if m%p==0: return m==p
    return True
cnt=0; examples=[]; last=[]
for n in range(1,N+1):
    if isprime_m2p1(n):
        cnt+=1
        if len(examples)<12: examples.append((n,n*n+1))
        last.append((n,n*n+1))
        if len(last)>5: last.pop(0)
# BH product truncated at primes<=N
prod=1.0
for p in primes:
    if p==2:
        roots=1
    elif p%4==1:
        roots=2
    else:
        roots=0
    prod *= (1-roots/p)/(1-1/p)
# numerical integral by midpoint rule, enough for comparison
M=20000
h=N/M
integ=0.0
for k in range(M):
    x=(k+0.5)*h
    if x>=1:
        integ += h/math.log(x*x+1)
# avoid x near 0 issue; contribution negligible and not standard asymptotic-sensitive
print('N',N)
print('count',cnt)
print('first',examples)
print('last',last)
print('BH_product_truncated',prod)
print('BH_integral_estimate',prod*integ)
print('crude_coeff_count_logN_over_N',cnt*math.log(N)/N)