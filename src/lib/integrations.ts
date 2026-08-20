/**
 * Normalized boundary for future DMS and scheduling integrations. Declaring an
 * adapter never implies credentials, an endpoint, or a successful connection.
 */
export type IntegrationStatus = "connected" | "not_connected" | "error" | "syncing";
export type IntegrationMode = "provider" | "demo" | "manual";
export type ExternalRepairOrder = {
  externalId: string;
  sourceSystem: string;
  updatedAt: string;
  payload: Record<string, unknown>;
};

export interface IntegrationAdapter {
  readonly id: string;
  readonly label: string;
  readonly mode: IntegrationMode;
  readonly status: IntegrationStatus;
  fetchAppointments(): Promise<ExternalRepairOrder[]>;
  fetchOpenRepairOrders(): Promise<ExternalRepairOrder[]>;
  fetchRepairOrder(externalId: string): Promise<ExternalRepairOrder | null>;
  fetchTechnicianAssignments(): Promise<ExternalRepairOrder[]>;
  fetchEstimateStatus(): Promise<ExternalRepairOrder[]>;
  fetchAuthorizationStatus(): Promise<ExternalRepairOrder[]>;
  fetchPartsStatus(): Promise<ExternalRepairOrder[]>;
  fetchVehicleStatus(): Promise<ExternalRepairOrder[]>;
  fetchCustomerContact(): Promise<ExternalRepairOrder[]>;
  fetchPromiseTime(): Promise<ExternalRepairOrder[]>;
}

abstract class ReadOnlyLaneAdapter implements IntegrationAdapter {
  abstract readonly id: string;
  abstract readonly label: string;
  abstract readonly mode: IntegrationMode;
  abstract readonly status: IntegrationStatus;
  protected abstract list(): Promise<ExternalRepairOrder[]>;

  fetchAppointments() { return this.list(); }
  fetchOpenRepairOrders() { return this.list(); }
  async fetchRepairOrder(externalId: string) { return (await this.list()).find((record) => record.externalId === externalId) ?? null; }
  fetchTechnicianAssignments() { return this.list(); }
  fetchEstimateStatus() { return this.list(); }
  fetchAuthorizationStatus() { return this.list(); }
  fetchPartsStatus() { return this.list(); }
  fetchVehicleStatus() { return this.list(); }
  fetchCustomerContact() { return this.list(); }
  fetchPromiseTime() { return this.list(); }
}

/** Explicitly fictional local records; these are never provider data. */
export class DemoAdapter extends ReadOnlyLaneAdapter {
  readonly id = "demo";
  readonly label = "Demo Mode (fictional records)";
  readonly mode = "demo" as const;
  readonly status = "not_connected" as const;
  private readonly records: readonly ExternalRepairOrder[];
  constructor(records: readonly ExternalRepairOrder[] = []) {
    super();
    this.records = records;
  }
  protected async list() { return [...this.records]; }
}

/**
 * A local manual lane backed by an injected server-side reader. The adapter
 * deliberately has no provider credentials or endpoint and cannot masquerade
 * as an external DMS connection.
 */
export class ManualAdapter extends ReadOnlyLaneAdapter {
  readonly id = "manual";
  readonly label = "Manual lane";
  readonly mode = "manual" as const;
  readonly status = "not_connected" as const;
  private readonly readManualRecords: () => Promise<ExternalRepairOrder[]>;
  constructor(readManualRecords: () => Promise<ExternalRepairOrder[]> = async () => []) {
    super();
    this.readManualRecords = readManualRecords;
  }
  protected list() { return this.readManualRecords(); }
}

export class NotConnectedAdapter implements IntegrationAdapter {
  readonly mode = "provider" as const;
  readonly status = "not_connected" as const;
  readonly id: string;
  readonly label: string;
  constructor(id: string, label: string) {
    this.id = id;
    this.label = label;
  }
  private unavailable<T>(): Promise<T> { return Promise.reject(new Error(`${this.label} is not connected`)); }
  fetchAppointments() { return this.unavailable<ExternalRepairOrder[]>(); }
  fetchOpenRepairOrders() { return this.unavailable<ExternalRepairOrder[]>(); }
  fetchRepairOrder() { return this.unavailable<ExternalRepairOrder | null>(); }
  fetchTechnicianAssignments() { return this.unavailable<ExternalRepairOrder[]>(); }
  fetchEstimateStatus() { return this.unavailable<ExternalRepairOrder[]>(); }
  fetchAuthorizationStatus() { return this.unavailable<ExternalRepairOrder[]>(); }
  fetchPartsStatus() { return this.unavailable<ExternalRepairOrder[]>(); }
  fetchVehicleStatus() { return this.unavailable<ExternalRepairOrder[]>(); }
  fetchCustomerContact() { return this.unavailable<ExternalRepairOrder[]>(); }
  fetchPromiseTime() { return this.unavailable<ExternalRepairOrder[]>(); }
}

/** Provider placeholders only; no provider is presented as configured. */
export const integrationAdapters: IntegrationAdapter[] = [
  new NotConnectedAdapter("xtime", "Xtime"),
  new NotConnectedAdapter("reynolds", "Reynolds & Reynolds"),
  new NotConnectedAdapter("toyota", "Toyota service systems"),
];
