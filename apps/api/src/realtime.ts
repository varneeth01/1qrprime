import { EventEmitter } from "node:events";

export type OperationsEvent = {
  id: string;
  tenantId: string;
  locationId: string;
  kind: "order.created" | "service_request.created" | "service_request.updated" | "order.updated";
  audience: "kitchen" | "service" | "manager";
  data: Record<string, unknown>;
};

export class OperationsRealtime {
  private readonly emitter = new EventEmitter();
  emit(event: OperationsEvent) { this.emitter.emit(`${event.tenantId}:${event.locationId}`, event); }
  subscribe(tenantId: string, locationId: string, listener: (event: OperationsEvent) => void) {
    const topic = `${tenantId}:${locationId}`;
    this.emitter.on(topic, listener);
    return () => this.emitter.off(topic, listener);
  }
}
