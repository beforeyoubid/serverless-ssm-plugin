import { sendCommand, SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import ServerlessSsmPlugin from '..';
import { ServerlessWithError } from '../types';
import { existsSync, promises } from 'fs';

import { log } from '@serverless/utils/log';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  promises: {
    unlink: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@aws-sdk/client-secrets-manager', () => ({
  ...jest.requireActual('@aws-sdk/client-secrets-manager'),
  SecretsManagerClient: jest.fn(),
}));

jest.mock('@serverless/utils/log', () => ({
  ...jest.requireActual('@serverless/utils/log'),
  log: jest.fn(),
}));

describe('ssm plugin', () => {
  let plugin: ServerlessSsmPlugin;
  beforeEach(() => {
    jest.clearAllMocks();
    plugin = new ServerlessSsmPlugin(
      {
        service: {
          package: {},
          provider: {
            region: 'us-west-2',
          },
          environment: {
            API_ENV_SECRET_NAME: 'some-secrets',
          },
        },
        providers: {
          aws: {
            getCredentials: () => ({}),
          },
        },
        classes: {
          Error,
        },
      } as unknown as ServerlessWithError,
      {}
    );
  });
  describe('getParameterFromSsm', () => {
    it('should try to load from ssm', async () => {
      const returnValue = Math.random().toString();
      const send = jest.fn().mockResolvedValue({ SecretString: returnValue });
      (SecretsManagerClient as unknown as jest.Mock).mockReturnValue({ send });
      const name = Math.random().toString();
      const parameter = await plugin.getParameterFromSsm(name);
      expect(send).toBeCalled();
      expect(parameter).toBe(returnValue);
    });
  });
  describe('cleanupPackageSecrets', () => {
    it('should try to remove the secretsFile', async () => {
      const secretsFile = Math.random().toString();
      plugin.secretsFile = secretsFile;
      (existsSync as jest.Mock).mockReturnValue(true);
      (promises.unlink as jest.Mock).mockReturnValue(undefined);
      await plugin.cleanupPackageSecrets();
      expect(log as jest.Mock).toHaveBeenCalledWith(expect.stringMatching(secretsFile));
      expect(existsSync).toBeCalledWith(secretsFile);
      expect(promises.unlink).toBeCalledWith(secretsFile);
    });
    it('should not try to remove the secretsFile if not on disk', async () => {
      const secretsFile = Math.random().toString();
      plugin.secretsFile = secretsFile;
      (existsSync as jest.Mock).mockReturnValue(false);
      await plugin.cleanupPackageSecrets();
      expect(log as jest.Mock).toHaveBeenCalledWith(expect.stringMatching(secretsFile));
      expect(existsSync).toBeCalledWith(secretsFile);
      expect(promises.unlink).toHaveBeenCalledTimes(0);
    });
  });
  describe('writeEnvironmentSecretToFile', () => {
    it('should throw an error if provider secret name not in environment variables', async () => {
      plugin.serverless.service.provider.environment = {};
      await expect(plugin.writeEnvironmentSecretToFile()).rejects.toThrow(Error);
    });
    it('should throw an error if parameter not available by calling getParameterFromSsm', async () => {
      const providerSecretTitle = Math.random().toString();
      plugin.serverless.service.provider.environment = { API_ENV_SECRET_NAME: providerSecretTitle };

      const send = jest.fn().mockResolvedValue({ SecretString: undefined });
      (SecretsManagerClient as unknown as jest.Mock).mockReturnValue({ send });
      await expect(plugin.writeEnvironmentSecretToFile()).rejects.toThrow(Error);
      expect(send).toBeCalled();
      expect(promises.writeFile).toHaveBeenCalledTimes(0);
    });
    it('should get parameter by calling getParameterFromSsm and write to disk', async () => {
      const providerSecretTitle = Math.random().toString();
      plugin.serverless.service.provider.environment = { API_ENV_SECRET_NAME: providerSecretTitle };
      (promises.writeFile as jest.Mock).mockReturnValue(undefined);

      const returnValue = Math.random().toString();
      const send = jest.fn().mockResolvedValue({ SecretString: returnValue });
      (SecretsManagerClient as unknown as jest.Mock).mockReturnValue({ send });
      await plugin.writeEnvironmentSecretToFile();
      expect(send).toBeCalled();
      expect(promises.writeFile).toHaveBeenCalledWith(
        plugin.secretsFile,
        JSON.stringify({ [providerSecretTitle]: returnValue })
      );
    });
  });
  describe('packageSecrets', () => {
    it('should throw an error if provider secret name not in environment variables', async () => {
      plugin.serverless.service.provider.environment = {};
      await expect(plugin.packageSecrets()).rejects.toThrow(Error);
      expect(log as jest.Mock).toHaveBeenCalled();
    });
    it('should throw an error if parameter not available by calling getParameterFromSsm', async () => {
      const providerSecretTitle = Math.random().toString();
      plugin.serverless.service.provider.environment = { API_ENV_SECRET_NAME: providerSecretTitle };

      const send = jest.fn().mockReturnValue({
        promise: () => Promise.resolve({ SecretString: undefined }),
      });
      (SecretsManagerClient as unknown as jest.Mock).mockReturnValue({ send });
      await expect(plugin.packageSecrets()).rejects.toThrow(Error);
      expect(send).toBeCalled();
      expect(promises.writeFile).toHaveBeenCalledTimes(0);
      expect(log as jest.Mock).toHaveBeenCalled();
    });
    it('should get parameter by calling getParameterFromSsm and write to disk', async () => {
      const providerSecretTitle = Math.random().toString();
      plugin.serverless.service.provider.environment = { API_ENV_SECRET_NAME: providerSecretTitle };
      (promises.writeFile as jest.Mock).mockReturnValue(undefined);

      const returnValue = Math.random().toString();
      const send = jest.fn().mockResolvedValue({ SecretString: returnValue });
      (SecretsManagerClient as unknown as jest.Mock).mockReturnValue({ send });
      await plugin.packageSecrets();
      expect(log as jest.Mock).toHaveBeenCalled();
      expect(send).toBeCalled();
      expect(promises.writeFile).toHaveBeenCalledWith(
        plugin.secretsFile,
        JSON.stringify({ [providerSecretTitle]: returnValue })
      );
      expect(plugin.serverless.service.package.include).toEqual([plugin.secretsFile]);
    });
  });
});
