export type RuntimeConfiguration = {
  production: boolean;
  staticDemo: boolean;
  databaseUrl?: string;
  authEnabled: boolean;
  authSecret?: string;
  authUrl?: string;
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
  if (!config.authSecret?.trim()) {
    throw new Error("BETTER_AUTH_SECRET is required for the production dashboard; refusing to use an ephemeral auth secret.");
  }
  if (!config.authUrl?.trim()) {
    throw new Error("BETTER_AUTH_URL is required for the production dashboard; refusing to use a local auth origin.");
  }
}
