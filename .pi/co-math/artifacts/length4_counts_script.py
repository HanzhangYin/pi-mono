from itertools import permutations, combinations
from collections import defaultdict
import json, hashlib, sys, platform, pathlib
from datetime import datetime, UTC

def std_tuple(vals):
    order = {v:i+1 for i,v in enumerate(sorted(vals))}
    return tuple(order[v] for v in vals)

def contains_pattern(p, pat):
    for idxs in combinations(range(len(p)), 4):
        if std_tuple([p[i] for i in idxs]) == pat:
            return True
    return False

def avoids_bruteforce(n, pat):
    c = 0
    examples_bad = []
    for p in permutations(range(1, n+1)):
        if not contains_pattern(p, pat):
            c += 1
    return c

def pattern_of_quad(a,b,c,d):
    vals = (a,b,c,d)
    s = sorted(vals)
    return tuple(s.index(x)+1 for x in vals)

def contains_pattern_direct(p, pat):
    n=len(p)
    for i in range(n-3):
      pi=p[i]
      for j in range(i+1,n-2):
        pj=p[j]
        for k in range(j+1,n-1):
          pk=p[k]
          for l in range(k+1,n):
            if pattern_of_quad(pi,pj,pk,p[l]) == pat:
                return True
    return False

def avoids_direct(n, pat):
    return sum(1 for p in permutations(range(1,n+1)) if not contains_pattern_direct(p,pat))

patterns = list(permutations((1,2,3,4)))
counts = {''.join(map(str,pat)): [] for pat in patterns}
counts2 = {''.join(map(str,pat)): [] for pat in patterns}
for pat in patterns:
    key=''.join(map(str,pat))
    for n in range(0,8):
        if n < 4:
            val = 1
            for x in range(2,n+1): val *= x
            val2 = val
        else:
            val = avoids_bruteforce(n, pat)
            val2 = avoids_direct(n, pat)
        counts[key].append(val)
        counts2[key].append(val2)
        if val != val2:
            raise SystemExit(f'mismatch {key} n={n}: {val} != {val2}')
classes = defaultdict(list)
for k,v in counts.items():
    classes[tuple(v)].append(k)
result = {
  'question': 'single length-4 permutation pattern avoidance counts for n=0..7',
  'n_range': [0,7],
  'patterns': sorted(counts),
  'counts_by_pattern': {k: counts[k] for k in sorted(counts)},
  'wilf_classes_observed_to_7': [ {'counts': list(seq), 'patterns': sorted(pats)} for seq,pats in sorted(classes.items(), key=lambda x:(x[0], x[1])) ],
  'validation': {
    'methods': ['itertools permutations + combinations + standardization', 'itertools permutations + nested index loops + direct quadruple ranking'],
    'agreement': True,
    'total_pattern_n_pairs_checked': len(patterns)*8
  },
  'environment': {'python': sys.version, 'platform': platform.platform()},
  'created_at_utc': datetime.now(UTC).isoformat(timespec='seconds').replace('+00:00','Z')
}
text = json.dumps(result, indent=2, sort_keys=True)
result['sha256_without_self_hash'] = hashlib.sha256(text.encode()).hexdigest()
path=pathlib.Path('.pi/co-math/artifacts/length4_avoidance_counts_n_le_7.json')
path.write_text(json.dumps(result, indent=2, sort_keys=True)+'\n')
print(path)
print(json.dumps(result['wilf_classes_observed_to_7'], indent=2))
