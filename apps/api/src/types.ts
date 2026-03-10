export type Env = {
  Bindings: {
    APP_DB: D1Database;
    SUPABASE_URL: string;
    STRIPE_SECRET_KEY: string;
    STRIPE_WEBHOOK_SECRET: string;
    APP_BASE_URL?: string;
  };
};

export type AuthenticatedUser = {
  userId: string;
};
