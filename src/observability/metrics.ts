type ToolMetrics = {
  executions: number;
  totalDurationMs: number;
};

const startedAtMs = Date.now();
const byTool = new Map<string, ToolMetrics>();

export function recordToolExecution(tool: string, durationMs: number) {
  const current = byTool.get(tool) ?? { executions: 0, totalDurationMs: 0 };
  current.executions += 1;
  current.totalDurationMs += Math.max(0, durationMs);
  byTool.set(tool, current);
}

export function getMetricsSnapshot() {
  const tools = Array.from(byTool.entries())
    .sort(([toolA], [toolB]) => toolA.localeCompare(toolB))
    .map(([tool, metrics]) => ({
      tool,
      executions: metrics.executions,
      avgDurationMs:
        metrics.executions > 0
          ? Math.round((metrics.totalDurationMs / metrics.executions) * 100) / 100
          : 0,
    }));

  return {
    startedAt: new Date(startedAtMs).toISOString(),
    uptimeMs: Date.now() - startedAtMs,
    totalExecutions: tools.reduce((sum, tool) => sum + tool.executions, 0),
    tools,
  };
}
