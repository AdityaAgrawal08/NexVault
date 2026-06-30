import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { SimpleSpanProcessor, ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";

let sdk: NodeSDK | null = null;

export function initializeTelemetry() {
  if (process.env["DISABLE_OTEL"] === "true") {
    console.log("[Telemetry] OpenTelemetry is disabled via env.");
    return;
  }

  try {
    sdk = new NodeSDK({
      spanProcessor: new SimpleSpanProcessor(new ConsoleSpanExporter()), // Log spans to console for local visibility
      instrumentations: [
        getNodeAutoInstrumentations({
          // Configure specific instrumentations if needed
          "@opentelemetry/instrumentation-fs": { enabled: false }, // Disable fs to reduce console noise
        }),
      ],
    });

    sdk.start();
    console.log("[Telemetry] OpenTelemetry initialized successfully.");
  } catch (error) {
    console.error("[Telemetry] Failed to initialize OpenTelemetry:", error);
  }
}

// Graceful shutdown
process.on("SIGTERM", () => {
  if (sdk) {
    sdk.shutdown()
      .then(() => console.log("[Telemetry] OpenTelemetry shut down successfully."))
      .catch((err) => console.error("[Telemetry] Error shutting down OpenTelemetry:", err))
      .finally(() => process.exit(0));
  }
});
