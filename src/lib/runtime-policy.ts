export type RuntimeConfiguration = {
  production: boolean;
  staticDemo: boolean;
  databaseUrl?: string;
  authEnabled: boolean;
};

/** Fail closed for the private deployment while allowing the Pages demo. */
export function assertProductionConfiguration(config: RuntimeConfiguration): void {
  if (!config.production || config.staticDemo) return;
  if (!config.databaseUrl?.trim()) {
    throw new Error("DATABASE_URL is required for the production dashboard; refusing to start without managed Postgres.");
  }
  if (!config.authEnabled) {
    throw new Error("Production authentication must remain enabled; refusing to start with the demo auth switch off.");
  }
}
