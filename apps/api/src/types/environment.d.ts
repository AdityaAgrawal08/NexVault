declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DATABASE_URL: string;
      PORT: string;

      JWT_SECRET: string;
      JWT_ACCESS_TOKEN_EXPIRES_IN: string;
      JWT_REFRESH_TOKEN_EXPIRES_IN: string;
    }
  }
}

export { };
