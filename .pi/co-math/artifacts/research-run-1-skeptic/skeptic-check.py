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

reported = [
    1,2,4,6,10,14,16,20,24,26,36,40,54,56,66,74,84,90,94,
    110,116,120,124,126,130,134,146,150,156,160,170,176,180,184
]

actual = [n for n in range(1, 201) if is_prime(n*n + 1)]

bad_missing = [n for n in actual if n not in reported]
bad_extra = [n for n in reported if n not in actual]

print("actual_count:", len(actual))
print("reported_count:", len(reported))
print("missing_from_report:", bad_missing)
print("extra_in_report:", bad_extra)
print("counterexample_found:", str(bool(bad_missing or bad_extra or len(reported) != 34)).lower())