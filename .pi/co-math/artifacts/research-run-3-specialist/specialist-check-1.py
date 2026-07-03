import math

def is_prime(n):
    if n < 2: return False
    if n % 2 == 0: return n == 2
    if n % 3 == 0: return n == 3
    r = int(math.isqrt(n))
    f = 5
    while f <= r:
        if n % f == 0 or n % (f+2) == 0:
            return False
        f += 6
    return True

N=200000
vals=[]
for n in range(1,N+1):
    if is_prime(n*n+1):
        vals.append(n)
print('N', N)
print('count', len(vals))
print('first_n', vals[:20])
print('last_n', vals[-10:])
# Estimate BH constant for f=n^2+1: product over odd p of (1-rho(p)/p)/(1-1/p), rho=2 if p=1 mod4, rho=0 if p=3 mod4; p=2 factor handled separately gives 1.
def primes_upto(M):
    sieve=bytearray(b'\x01')*(M+1)
    sieve[:2]=b'\x00\x00'
    for i in range(2,int(math.isqrt(M))+1):
        if sieve[i]:
            step=i; start=i*i
            sieve[start:M+1:step]=b'\x00'*(((M-start)//step)+1)
    return [i for i in range(2,M+1) if sieve[i]]
for M in [100,1000,10000,100000]:
    C=1.0
    for p in primes_upto(M):
        if p==2: continue
        rho = 2 if p%4==1 else 0
        C *= (1-rho/p)/(1-1/p)
    # integral approx int_2^N dt/log(t^2+1)
    steps=20000
    a=2; b=N; h=(b-a)/steps
    S=0.5/(math.log(a*a+1))+0.5/(math.log(b*b+1))
    for k in range(1,steps):
        t=a+k*h
        S += 1/math.log(t*t+1)
    I=S*h
    print('prod_bound',M,'C_est',C,'BH_pred_for_N',C*I)