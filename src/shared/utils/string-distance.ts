export function levenshteinDistance(left: string, right: string): number {
  const a = left.toLowerCase();
  const b = right.toLowerCase();

  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const previous = new Array<number>(b.length + 1);
  const current = new Array<number>(b.length + 1);

  for (let column = 0; column <= b.length; column += 1) {
    previous[column] = column;
  }

  for (let row = 1; row <= a.length; row += 1) {
    current[0] = row;

    for (let column = 1; column <= b.length; column += 1) {
      const substitutionCost = a[row - 1] === b[column - 1] ? 0 : 1;
      current[column] = Math.min(
        (previous[column] ?? Number.POSITIVE_INFINITY) + 1,
        (current[column - 1] ?? Number.POSITIVE_INFINITY) + 1,
        (previous[column - 1] ?? Number.POSITIVE_INFINITY) + substitutionCost
      );
    }

    for (let column = 0; column <= b.length; column += 1) {
      previous[column] = current[column] ?? 0;
    }
  }

  return previous[b.length] ?? 0;
}

export function findClosestString(input: string, options: string[]): string | undefined {
  if (options.length === 0) return undefined;

  const scored = options.map((option) => ({
    option,
    distance: levenshteinDistance(input, option),
  }));

  scored.sort((first, second) => {
    if (first.distance !== second.distance) {
      return first.distance - second.distance;
    }
    return first.option.localeCompare(second.option);
  });

  return scored[0]?.option;
}