import { SecretsManagerClient, GetSecretValueCommand, PutSecretValueCommand, CreateSecretCommand } from '@aws-sdk/client-secrets-manager'
import { readConfig } from '../config'

function getClient(): SecretsManagerClient {
  const config = readConfig()
  return new SecretsManagerClient({ region: config.aws.region })
}

export async function smGet(secretId: string): Promise<unknown> {
  try {
    const result = await getClient().send(new GetSecretValueCommand({ SecretId: secretId }))
    return JSON.parse(result.SecretString ?? '{}')
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'ResourceNotFoundException') {
      return null
    }
    throw err
  }
}

export async function smPut(secretId: string, value: unknown): Promise<void> {
  const client = getClient()
  const payload = JSON.stringify(value)
  try {
    await client.send(new PutSecretValueCommand({ SecretId: secretId, SecretString: payload }))
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'ResourceNotFoundException') {
      await client.send(new CreateSecretCommand({ Name: secretId, SecretString: payload }))
    } else {
      throw err
    }
  }
}
