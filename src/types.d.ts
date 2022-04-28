import Serverless from 'serverless';
import PluginManager from 'serverless/classes/PluginManager';
import Service from 'serverless/classes/Service';

export type Options = {
  // EMPTY
};
export type ServerlessWithError = Serverless & {
  classes: {
    Error: typeof SLSError;
  };
  pluginManager: PluginManager & {
    cliOptions: {
      stage?: string;
      region?: string;
    };
  };
  service: Service & {
    provider: Service['provider'] & {
      environment: Record<string, unknown>;
    };
  };
  providers: {
    aws: {
      getCredentials();
    };
  };
};

declare global {
  type Maybe<T> = null | undefined | T;
}
