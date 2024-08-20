import fs from 'fs';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import Plugin from 'serverless/classes/Plugin';
import { log } from '@serverless/utils/log';

import { Options, ServerlessWithError } from './types';

export default class ServerlessSsmPlugin implements Plugin {
  hooks: Plugin['hooks'];
  options: Options;
  serverless: ServerlessWithError;
  region: string;
  public secretsFile: string;

  constructor(serverless: ServerlessWithError, options: Options) {
    this.hooks = {
      'before:package:createDeploymentArtifacts': this.packageSecrets.bind(this),
      'after:package:createDeploymentArtifacts': this.cleanupPackageSecrets.bind(this),
      'before:deploy:function:packageFunction': this.packageSecrets.bind(this),
      'after:deploy:function:packageFunction': this.cleanupPackageSecrets.bind(this),
      // For serverless-offline plugin
      'before:offline:start:init': this.packageSecrets.bind(this),
      'before:offline:start:end': this.cleanupPackageSecrets.bind(this),
      // For invoke local
      'before:invoke:local:invoke': this.packageSecrets.bind(this),
      'after:invoke:local:invoke': this.cleanupPackageSecrets.bind(this),
    };

    this.options = options;
    this.serverless = serverless;
    this.region = serverless.service.provider.region;
    this.secretsFile = process.env.SECRETS_FILE_PATH ?? 'secrets.json';
  }

  async writeEnvironmentSecretToFile(): Promise<void> {
    const providerSecrets = this.serverless.service.provider.environment['API_ENV_SECRET_NAME'] as Maybe<string>;
    const secrets: Record<string, string> = {};

    // modify this function to return the secrets
    if (!providerSecrets) {
      throw new this.serverless.classes.Error(`Unable to find the environment variable for ${providerSecrets}`);
    }
    const param = await this.getParameterFromSsm(providerSecrets);

    if (!param) {
      throw new this.serverless.classes.Error(`Unable to load Secret ${providerSecrets}`);
    }

    secrets[providerSecrets] = param;

    return fs.promises.writeFile(this.secretsFile, JSON.stringify(secrets));
  }

  async getParameterFromSsm(name: string): Promise<Maybe<string>> {
    const client = new SecretsManagerClient({
      region: this.region,
      ...this.serverless.providers.aws.getCredentials(),
    });
    const data = await client.send(new GetSecretValueCommand({ SecretId: name }));
    return data.SecretString;
  }

  async cleanupPackageSecrets(): Promise<void> {
    log(`Cleaning up ${this.secretsFile}`);
    if (fs.existsSync(this.secretsFile)) {
      await fs.promises.unlink(this.secretsFile);
    }
  }

  async packageSecrets(): Promise<void> {
    if (this.serverless.service.provider.stage === 'local') {
      log('Skipping secret packaging due to stage = local');
      return;
    }
    log('Serverless Secrets beginning packaging process');
    this.serverless.service.package.include = this.serverless.service.package.include ?? [];
    await this.writeEnvironmentSecretToFile();
    this.serverless.service.package.include.push(this.secretsFile);
  }
}
