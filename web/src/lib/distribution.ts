// Preserve both local margins while borrowing national associations.
export function jointMargins(rows: number[], columns: number[], tilt?: number[][]): number[][] {
  const normalize = (v: number[]) => {
    const total = v.reduce((a, b) => a + b, 0);
    return v.map((x) => total > 0 ? x / total : 0);
  };
  const r = normalize(rows), c = normalize(columns);
  const joint = r.map((x, i) => c.map((y, j) => x * y * Math.max(1e-8, tilt?.[i]?.[j] ?? 1)));
  if (!r.some(Boolean) || !c.some(Boolean)) return joint;
  for (let iter = 0; iter < 1000; iter++) {
    for (let i = 0; i < r.length; i++) {
      const total = joint[i].reduce((a, b) => a + b, 0);
      for (let j = 0; j < c.length; j++) joint[i][j] *= total > 0 ? r[i] / total : 0;
    }
    for (let j = 0; j < c.length; j++) {
      const total = joint.reduce((a, row) => a + row[j], 0);
      for (let i = 0; i < r.length; i++) joint[i][j] *= total > 0 ? c[j] / total : 0;
    }
    if (joint.every((row, i) => Math.abs(row.reduce((a, b) => a + b, 0) - r[i]) < 1e-9)) return joint;
  }
  throw new Error('Joint margin calibration failed to converge');
}
