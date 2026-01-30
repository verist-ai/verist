import type { AuditEvent } from "@verist/core";

/**
 * Span attributes for workflow tracing.
 */
export interface SpanAttributes {
  workflowId?: string;
  runId?: string;
  stepId?: string;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Tracing adapter interface.
 * Integrates with OpenTelemetry for distributed tracing.
 */
export interface TracingAdapter {
  /**
   * Start a new span.
   * Returns a span context for child spans.
   */
  startSpan(name: string, attributes?: SpanAttributes): SpanContext;

  /**
   * End a span.
   */
  endSpan(ctx: SpanContext): void;

  /**
   * Record an exception on the current span.
   */
  recordException(ctx: SpanContext, error: Error): void;
}

/**
 * Opaque span context for tracing.
 */
export interface SpanContext {
  traceId: string;
  spanId: string;
}

/**
 * Configuration for OpenTelemetry tracer.
 */
export interface OtelConfig {
  serviceName: string;
  endpoint?: string;
}

/**
 * Create an OpenTelemetry tracing adapter.
 * @placeholder Implementation pending
 */
export function createOtelTracer(_config: OtelConfig): TracingAdapter {
  throw new Error("@verist/otel: OpenTelemetry tracer not yet implemented");
}

/**
 * Configuration for JSONL file exporter.
 */
export interface JsonlExporterConfig {
  filePath: string;
}

/**
 * JSONL exporter for audit events.
 * Writes audit events to a JSONL file for debugging or offline analysis.
 */
export interface JsonlExporter {
  /**
   * Write audit events to JSONL file.
   */
  write(events: AuditEvent[]): Promise<void>;

  /**
   * Close the exporter.
   */
  close(): Promise<void>;
}

/**
 * Create a JSONL file exporter for audit events.
 * @placeholder Implementation pending
 */
export function createJsonlExporter(
  _config: JsonlExporterConfig,
): JsonlExporter {
  throw new Error("@verist/otel: JSONL exporter not yet implemented");
}
