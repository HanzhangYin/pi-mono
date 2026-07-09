from math import gcd
B=5000
bad=[]
min_count=None
min_examples=[]
for m in range(2,B+1):
    cnt=0
    for r in range(m):
        if gcd(r*r+1,m)==1:
            cnt+=1
    if cnt==0:
        bad.append(m)
    if min_count is None or cnt<min_count:
        min_count=cnt
        min_examples=[(m,cnt)]
    elif cnt==min_count and len(min_examples)<10:
        min_examples.append((m,cnt))
print('B',B)
print('complete_obstruction_moduli_count',len(bad))
print('complete_obstruction_moduli_first',bad[:20])
print('minimum_admissible_residue_count',min_count)
print('examples_attaining_minimum',min_examples)
for m in [2,4,8,16,3,5,10,20,60,120,840,2520,5040]:
    if m<=B:
        cnt=sum(1 for r in range(m) if gcd(r*r+1,m)==1)
        print('m',m,'admissible',cnt,'of',m,'density',cnt/m)