import type { ComputationalScriptDraft } from "./comath-computation-executor.ts";

const MAX_MATRIX_DIMENSION = 12;
const MAX_PARTITION_LENGTH = 12;
const MAX_PARTITION_DEGREE_COUNT = 48;
const MAX_INTEGER_ABSOLUTE_VALUE = 1_000_000_000;

interface IntegerMatrixInput {
	matrix: number[][];
}

interface PartitionPieriInput {
	lower: number[];
	upper: number[];
	degrees: number[];
	hDegrees: number[];
	requireSmithWitnesses: boolean;
}

export function buildMathPrimitiveDraft(
	primitive: unknown,
	input: unknown,
	summary: string = "Exact mathematical primitive.",
): ComputationalScriptDraft {
	if (primitive === "integer-matrix") {
		const normalized = normalizeIntegerMatrixInput(input);
		return draft("integer-matrix", normalized, summary);
	}
	if (primitive === "partition-pieri") {
		const normalized = normalizePartitionPieriInput(input);
		return draft("partition-pieri", normalized, summary);
	}
	throw new Error("Unknown mathematical primitive. Use integer-matrix or partition-pieri.");
}

function normalizeIntegerMatrixInput(input: unknown): IntegerMatrixInput {
	if (!isRecord(input) || !Array.isArray(input.matrix) || input.matrix.length === 0) {
		throw new Error("integer-matrix requires a nonempty matrix array.");
	}
	if (input.matrix.length > MAX_MATRIX_DIMENSION) {
		throw new Error(`integer-matrix supports at most ${MAX_MATRIX_DIMENSION} rows.`);
	}
	const matrix = input.matrix.map((row) => {
		if (!Array.isArray(row) || row.length === 0 || row.length > MAX_MATRIX_DIMENSION) {
			throw new Error(`integer-matrix rows must contain 1-${MAX_MATRIX_DIMENSION} entries.`);
		}
		return row.map((entry) => boundedInteger(entry, "matrix entry"));
	});
	if (matrix.some((row) => row.length !== matrix[0]?.length)) {
		throw new Error("integer-matrix rows must have equal length.");
	}
	return { matrix };
}

function normalizePartitionPieriInput(input: unknown): PartitionPieriInput {
	if (!isRecord(input) || !Array.isArray(input.lower) || !Array.isArray(input.upper)) {
		throw new Error("partition-pieri requires lower and upper partition arrays.");
	}
	if (
		input.lower.length === 0 ||
		input.lower.length !== input.upper.length ||
		input.lower.length > MAX_PARTITION_LENGTH
	) {
		throw new Error(`partition-pieri bounds must have equal length between 1 and ${MAX_PARTITION_LENGTH}.`);
	}
	const lower = input.lower.map((entry) => nonnegativeInteger(entry, "lower partition entry"));
	const upper = input.upper.map((entry) => nonnegativeInteger(entry, "upper partition entry"));
	if (!isPartition(lower) || !isPartition(upper)) {
		throw new Error("partition-pieri bounds must be weakly decreasing partitions.");
	}
	if (lower.some((entry, index) => entry > (upper[index] ?? -1))) {
		throw new Error("partition-pieri lower bound must be componentwise contained in the upper bound.");
	}
	const rawDegrees = Array.isArray(input.degrees) ? input.degrees : [input.degree];
	if (rawDegrees.length === 0 || rawDegrees.length > MAX_PARTITION_DEGREE_COUNT) {
		throw new Error(`partition-pieri requires 1-${MAX_PARTITION_DEGREE_COUNT} degrees.`);
	}
	const degrees = [...new Set(rawDegrees.map((entry) => nonnegativeInteger(entry, "degree")))].sort(
		(left, right) => left - right,
	);
	if (degrees.some((degree) => degree < sum(lower) || degree > sum(upper))) {
		throw new Error("partition-pieri degrees must lie between the bound sizes.");
	}
	if (!Array.isArray(input.hDegrees) || input.hDegrees.length === 0) {
		throw new Error("partition-pieri requires at least one positive h-degree.");
	}
	const hDegrees = [...new Set(input.hDegrees.map((entry) => positiveInteger(entry, "h-degree")))].sort(
		(left, right) => left - right,
	);
	if (hDegrees.some((entry) => entry > sum(upper) - sum(lower))) {
		throw new Error("partition-pieri h-degrees cannot exceed the size difference between the bounds.");
	}
	if (input.requireSmithWitnesses !== undefined && typeof input.requireSmithWitnesses !== "boolean") {
		throw new Error("partition-pieri requireSmithWitnesses must be boolean when provided.");
	}
	return { lower, upper, degrees, hDegrees, requireSmithWitnesses: input.requireSmithWitnesses === true };
}

function draft(
	primitive: "integer-matrix" | "partition-pieri",
	input: IntegerMatrixInput | PartitionPieriInput,
	summary: string,
): ComputationalScriptDraft {
	const payload = JSON.stringify({ primitive, input });
	return {
		fileName: `comath-${primitive}.py`,
		language: "python",
		content: `${PYTHON_RUNTIME}\nREQUEST = json.loads(${JSON.stringify(payload)})\nrun(REQUEST)\n`,
		summary,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedInteger(value: unknown, label: string): number {
	if (!Number.isSafeInteger(value) || Math.abs(value as number) > MAX_INTEGER_ABSOLUTE_VALUE) {
		throw new Error(`${label} must be a safe integer with absolute value at most ${MAX_INTEGER_ABSOLUTE_VALUE}.`);
	}
	return value as number;
}

function nonnegativeInteger(value: unknown, label: string): number {
	const integer = boundedInteger(value, label);
	if (integer < 0) throw new Error(`${label} must be nonnegative.`);
	return integer;
}

function positiveInteger(value: unknown, label: string): number {
	const integer = boundedInteger(value, label);
	if (integer <= 0) throw new Error(`${label} must be positive.`);
	return integer;
}

function isPartition(value: readonly number[]): boolean {
	return value.every((entry, index) => index === 0 || (value[index - 1] ?? -1) >= entry);
}

function sum(value: readonly number[]): number {
	return value.reduce((total, entry) => total + entry, 0);
}

const PYTHON_RUNTIME = `import itertools
import json
import math
from fractions import Fraction

MAX_MINOR_COUNT = 200000

def determinant(matrix):
    n = len(matrix)
    if n == 0:
        return 1
    if any(len(row) != n for row in matrix):
        raise ValueError("determinant requires a square matrix")
    work = [list(map(int, row)) for row in matrix]
    sign = 1
    previous = 1
    for pivot_index in range(n - 1):
        pivot_row = next((row for row in range(pivot_index, n) if work[row][pivot_index] != 0), None)
        if pivot_row is None:
            return 0
        if pivot_row != pivot_index:
            work[pivot_index], work[pivot_row] = work[pivot_row], work[pivot_index]
            sign = -sign
        pivot = work[pivot_index][pivot_index]
        for row in range(pivot_index + 1, n):
            for column in range(pivot_index + 1, n):
                numerator = work[row][column] * pivot - work[row][pivot_index] * work[pivot_index][column]
                if numerator % previous != 0:
                    raise ArithmeticError("Bareiss division was not exact")
                work[row][column] = numerator // previous
            work[row][pivot_index] = 0
        previous = pivot
    return sign * work[n - 1][n - 1]

def rational_rank(matrix):
    if not matrix:
        return 0
    work = [[Fraction(entry) for entry in row] for row in matrix]
    rows = len(work)
    columns = len(work[0])
    rank = 0
    for column in range(columns):
        pivot = next((row for row in range(rank, rows) if work[row][column]), None)
        if pivot is None:
            continue
        work[rank], work[pivot] = work[pivot], work[rank]
        divisor = work[rank][column]
        work[rank] = [entry / divisor for entry in work[rank]]
        for row in range(rows):
            if row != rank and work[row][column]:
                factor = work[row][column]
                work[row] = [left - factor * right for left, right in zip(work[row], work[rank])]
        rank += 1
        if rank == rows:
            break
    return rank

def exact_invariants(matrix):
    work = [row[:] for row in matrix]
    rows = len(work)
    columns = len(work[0]) if rows else 0
    diagonal = []
    pivot_index = 0
    while pivot_index < rows and pivot_index < columns:
        position = next(
            (
                (row, column)
                for row in range(pivot_index, rows)
                for column in range(pivot_index, columns)
                if work[row][column]
            ),
            None,
        )
        if position is None:
            break
        pivot_row, pivot_column = position
        work[pivot_index], work[pivot_row] = work[pivot_row], work[pivot_index]
        for row in work:
            row[pivot_index], row[pivot_column] = row[pivot_column], row[pivot_index]
        while True:
            reduced = False
            for row in range(pivot_index + 1, rows):
                if not work[row][pivot_index]:
                    continue
                quotient = work[row][pivot_index] // work[pivot_index][pivot_index]
                work[row] = [left - quotient * right for left, right in zip(work[row], work[pivot_index])]
                if work[row][pivot_index] and abs(work[row][pivot_index]) < abs(work[pivot_index][pivot_index]):
                    work[pivot_index], work[row] = work[row], work[pivot_index]
                reduced = True
                break
            if reduced:
                continue
            for column in range(pivot_index + 1, columns):
                if not work[pivot_index][column]:
                    continue
                quotient = work[pivot_index][column] // work[pivot_index][pivot_index]
                for row in range(rows):
                    work[row][column] -= quotient * work[row][pivot_index]
                if work[pivot_index][column] and abs(work[pivot_index][column]) < abs(work[pivot_index][pivot_index]):
                    for row in range(rows):
                        work[row][pivot_index], work[row][column] = work[row][column], work[row][pivot_index]
                reduced = True
                break
            if reduced:
                continue
            offender = next(
                (
                    (row, column)
                    for row in range(pivot_index + 1, rows)
                    for column in range(pivot_index + 1, columns)
                    if work[row][column] % work[pivot_index][pivot_index]
                ),
                None,
            )
            if offender is None:
                break
            _, offender_column = offender
            for row in range(rows):
                work[row][pivot_index] += work[row][offender_column]
        if work[pivot_index][pivot_index] < 0:
            work[pivot_index] = [-entry for entry in work[pivot_index]]
        diagonal.append(work[pivot_index][pivot_index])
        pivot_index += 1
    divisors = []
    product = 1
    for entry in diagonal:
        product *= entry
        divisors.append(product)
    return len(diagonal), divisors, diagonal

def identity(size):
    return [[1 if row == column else 0 for column in range(size)] for row in range(size)]

def swap_rows(matrix, left, right):
    matrix[left], matrix[right] = matrix[right], matrix[left]

def swap_columns(matrix, left, right):
    for row in matrix:
        row[left], row[right] = row[right], row[left]

def add_row(matrix, target, source, multiplier):
    for column in range(len(matrix[0]) if matrix else 0):
        matrix[target][column] += multiplier * matrix[source][column]

def add_column(matrix, target, source, multiplier):
    for row in range(len(matrix)):
        matrix[row][target] += multiplier * matrix[row][source]

def negate_row(matrix, row):
    for column in range(len(matrix[0]) if matrix else 0):
        matrix[row][column] = -matrix[row][column]

def multiply(left, left_rows, shared, right, right_columns):
    return [
        [sum(left[row][index] * right[index][column] for index in range(shared)) for column in range(right_columns)]
        for row in range(left_rows)
    ]

def replay_smith_operations(matrix, row_count, column_count, operations):
    work = [row[:] for row in matrix]
    left = identity(row_count)
    right = identity(column_count)
    for operation in operations:
        if operation[0] == "rs":
            swap_rows(work, operation[1], operation[2])
            swap_rows(left, operation[1], operation[2])
        elif operation[0] == "cs":
            swap_columns(work, operation[1], operation[2])
            swap_columns(right, operation[1], operation[2])
        elif operation[0] == "ra":
            add_row(work, operation[1], operation[2], operation[3])
            add_row(left, operation[1], operation[2], operation[3])
        elif operation[0] == "ca":
            add_column(work, operation[1], operation[2], operation[3])
            add_column(right, operation[1], operation[2], operation[3])
        elif operation[0] == "rn":
            negate_row(work, operation[1])
            negate_row(left, operation[1])
        else:
            raise ValueError("unknown Smith operation")
    return work, left, right

def exact_smith_witness(matrix, column_count):
    original = [row[:] for row in matrix]
    work = [row[:] for row in matrix]
    row_count = len(work)
    left = identity(row_count)
    right = identity(column_count)
    operations = []
    determinant_left = 1
    determinant_right = 1
    pivot_index = 0
    while pivot_index < row_count and pivot_index < column_count:
        position = next(
            (
                (row, column)
                for row in range(pivot_index, row_count)
                for column in range(pivot_index, column_count)
                if work[row][column]
            ),
            None,
        )
        if position is None:
            break
        pivot_row, pivot_column = position
        if pivot_row != pivot_index:
            swap_rows(work, pivot_index, pivot_row)
            swap_rows(left, pivot_index, pivot_row)
            operations.append(["rs", pivot_index, pivot_row])
            determinant_left = -determinant_left
        if pivot_column != pivot_index:
            swap_columns(work, pivot_index, pivot_column)
            swap_columns(right, pivot_index, pivot_column)
            operations.append(["cs", pivot_index, pivot_column])
            determinant_right = -determinant_right
        while True:
            reduced = False
            for row in range(pivot_index + 1, row_count):
                if not work[row][pivot_index]:
                    continue
                quotient = work[row][pivot_index] // work[pivot_index][pivot_index]
                add_row(work, row, pivot_index, -quotient)
                add_row(left, row, pivot_index, -quotient)
                operations.append(["ra", row, pivot_index, -quotient])
                if work[row][pivot_index] and abs(work[row][pivot_index]) < abs(work[pivot_index][pivot_index]):
                    swap_rows(work, pivot_index, row)
                    swap_rows(left, pivot_index, row)
                    operations.append(["rs", pivot_index, row])
                    determinant_left = -determinant_left
                reduced = True
                break
            if reduced:
                continue
            for column in range(pivot_index + 1, column_count):
                if not work[pivot_index][column]:
                    continue
                quotient = work[pivot_index][column] // work[pivot_index][pivot_index]
                add_column(work, column, pivot_index, -quotient)
                add_column(right, column, pivot_index, -quotient)
                operations.append(["ca", column, pivot_index, -quotient])
                if work[pivot_index][column] and abs(work[pivot_index][column]) < abs(work[pivot_index][pivot_index]):
                    swap_columns(work, pivot_index, column)
                    swap_columns(right, pivot_index, column)
                    operations.append(["cs", pivot_index, column])
                    determinant_right = -determinant_right
                reduced = True
                break
            if reduced:
                continue
            offender = next(
                (
                    (row, column)
                    for row in range(pivot_index + 1, row_count)
                    for column in range(pivot_index + 1, column_count)
                    if work[row][column] % work[pivot_index][pivot_index]
                ),
                None,
            )
            if offender is None:
                break
            offender_column = offender[1]
            add_column(work, pivot_index, offender_column, 1)
            add_column(right, pivot_index, offender_column, 1)
            operations.append(["ca", pivot_index, offender_column, 1])
        if work[pivot_index][pivot_index] < 0:
            negate_row(work, pivot_index)
            negate_row(left, pivot_index)
            operations.append(["rn", pivot_index])
            determinant_left = -determinant_left
        pivot_index += 1
    replayed, replayed_left, replayed_right = replay_smith_operations(
        original, row_count, column_count, operations
    )
    product = multiply(
        multiply(left, row_count, row_count, original, column_count),
        row_count,
        column_count,
        right,
        column_count,
    )
    diagonal = [work[index][index] for index in range(pivot_index)]
    is_diagonal = all(
        work[row][column] == (diagonal[row] if row == column and row < pivot_index else 0)
        for row in range(row_count)
        for column in range(column_count)
    )
    checks = {
        "shapeCompatible": len(original) == row_count and all(len(row) == column_count for row in original),
        "replayEqualsTracked": replayed == work and replayed_left == left and replayed_right == right,
        "UMVEqualsD": product == work,
        "diagonal": is_diagonal,
        "smithPositivityDivisibility": all(entry > 0 for entry in diagonal)
        and all(diagonal[index] % diagonal[index - 1] == 0 for index in range(1, len(diagonal))),
        "unimodularU": determinant_left in (-1, 1),
        "unimodularV": determinant_right in (-1, 1),
        "detU": determinant_left,
        "detV": determinant_right,
    }
    if not all(value for key, value in checks.items() if key not in ("detU", "detV")):
        raise ArithmeticError("Smith witness verification failed")
    divisors = []
    product_of_diagonal = 1
    for entry in diagonal:
        product_of_diagonal *= entry
        divisors.append(product_of_diagonal)
    return pivot_index, divisors, diagonal, {
        "witnessRepresentation": "elementary-operation-log",
        "MShape": [row_count, column_count],
        "M": original,
        "DShape": [row_count, column_count],
        "D": work,
        "UShape": [row_count, row_count],
        "VShape": [column_count, column_count],
        "U": left if row_count == 0 else None,
        "V": right if row_count == 0 else None,
        "operationLog": operations,
        "checks": checks,
    }

def partitions_between(lower, upper, total):
    length = len(lower)
    suffix_lower = [0] * (length + 1)
    suffix_upper = [0] * (length + 1)
    for index in range(length - 1, -1, -1):
        suffix_lower[index] = suffix_lower[index + 1] + lower[index]
        suffix_upper[index] = suffix_upper[index + 1] + upper[index]
    output = []
    def visit(index, previous, remaining, prefix):
        if index == length:
            if remaining == 0:
                output.append(prefix)
            return
        minimum = lower[index]
        maximum = min(upper[index], previous, remaining)
        for entry in range(maximum, minimum - 1, -1):
            rest = remaining - entry
            if suffix_lower[index + 1] <= rest <= suffix_upper[index + 1]:
                visit(index + 1, entry, rest, prefix + [entry])
    visit(0, upper[0], total, [])
    return output

def is_horizontal_strip(source, target, degree):
    if sum(target) - sum(source) != degree:
        return False
    if any(left > right for left, right in zip(source, target)):
        return False
    return all(target[index + 1] <= source[index] for index in range(len(source) - 1))

def partition_pieri_result(data, degree):
    lower = data["lower"]
    upper = data["upper"]
    columns = partitions_between(lower, upper, degree)
    rows = []
    for h_degree in data["hDegrees"]:
        for source in partitions_between(lower, upper, degree - h_degree):
            coefficients = [1 if is_horizontal_strip(source, target, h_degree) else 0 for target in columns]
            rows.append({"hDegree": h_degree, "source": source, "coefficients": coefficients})
    matrix = [row["coefficients"] for row in rows]
    witness = None
    if data.get("requireSmithWitnesses"):
        rank, divisors, smith, witness = exact_smith_witness(matrix, len(columns))
    else:
        rank, divisors, smith = exact_invariants(matrix) if matrix else (0, [], [])
    result = {
        "degree": degree,
        "columns": columns,
        "rows": rows,
        "matrixShape": [len(matrix), len(columns)],
        "rank": rank,
        "determinantalDivisors": divisors,
        "smithDiagonal": smith,
        "quotientFreeRank": len(columns) - rank,
        "torsionInvariantFactors": [entry for entry in smith if entry > 1],
        "saturatedFullColumnRank": rank == len(columns) and (not smith or smith[-1] == 1),
    }
    if witness is not None:
        result.update(witness)
    return result

def run(request):
    primitive = request["primitive"]
    data = request["input"]
    if primitive == "integer-matrix":
        matrix = data["matrix"]
        rank, divisors, smith = exact_invariants(matrix)
        result = {
            "primitive": primitive,
            "input": data,
            "shape": [len(matrix), len(matrix[0])],
            "rank": rank,
            "determinant": determinant(matrix) if len(matrix) == len(matrix[0]) else None,
            "determinantalDivisors": divisors,
            "smithDiagonal": smith,
        }
    elif primitive == "partition-pieri":
        degree_results = [partition_pieri_result(data, degree) for degree in data["degrees"]]
        support_range = [sum(data["lower"]), sum(data["upper"])]
        zero_rows = [
            {"degree": degree_result["degree"], "hDegree": row["hDegree"], "source": row["source"]}
            for degree_result in degree_results
            for row in degree_result["rows"]
            if not any(row["coefficients"])
        ]
        result = {
            "primitive": primitive,
            "input": data,
            "certificateSummary": {
                "supportDegreeRange": support_range,
                "enumeratedAllSupportDegrees": data["degrees"] == list(range(support_range[0], support_range[1] + 1)),
                "vanishesOutsideSupportDegreeRange": True,
                "columnOrder": "partition enumeration order: reverse lexicographic",
                "rowOrder": "hDegrees input order, then source partition reverse lexicographic",
                "completeSourceRowsIncluded": True,
                "degreeSummaries": [
                    {
                        "degree": degree_result["degree"],
                        "rank": degree_result["rank"],
                        "quotientFreeRank": degree_result["quotientFreeRank"],
                        "smithDiagonal": degree_result["smithDiagonal"],
                        "torsionInvariantFactors": degree_result["torsionInvariantFactors"],
                        "zeroRowCount": sum(1 for row in degree_result["rows"] if not any(row["coefficients"])),
                    }
                    for degree_result in degree_results
                ],
                "zeroRows": zero_rows,
            },
            "degreeResults": degree_results,
        }
        if len(degree_results) == 1:
            result.update(degree_results[0])
    else:
        raise ValueError("unknown primitive")
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))`;
