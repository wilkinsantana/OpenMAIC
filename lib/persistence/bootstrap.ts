import {
  BrowserKVStore,
  HttpDocumentStore,
  HttpAssetStore,
  type HttpDocumentHeadersHook,
} from '@openmaic/storage';
import { HttpRuntimeStore, type HttpRuntimeHeadersHook } from '@openmaic/storage/runtime/http';

import {
  assertDocumentStorageConfigurable,
  configureDocumentStorage,
  type DocumentStorageOptions,
} from '@/lib/document-store/config';
import { assertRuntimeStorageConfigurable, configureRuntimeStorage } from '@/lib/runtime/config';
import { getLearnerKey } from '@/lib/runtime/learner-key';

import {
  assertAssetPoolStorageConfigurable,
  configureAssetPoolStorage,
} from '@/lib/media/asset-pool-config';

let deviceKv: BrowserKVStore | undefined;
let learnerKeyPromise: Promise<string> | undefined;

export function isBrowserPersistenceEnabled(): boolean {
  return typeof window !== 'undefined' && process.env.NEXT_PUBLIC_PERSISTENCE === '1';
}

export function getPersistenceLearnerKey(): Promise<string> {
  if (!isBrowserPersistenceEnabled()) {
    return Promise.reject(new Error('Browser persistence is not enabled'));
  }
  if (process.env.NEXT_PUBLIC_LOCAL_LEARNER_KEY)
    return Promise.resolve(process.env.NEXT_PUBLIC_LOCAL_LEARNER_KEY);
  return (learnerKeyPromise ??= getLearnerKey((deviceKv ??= new BrowserKVStore())).catch(
    (error) => {
      learnerKeyPromise = undefined;
      throw error;
    },
  ));
}

export async function getPersistenceRequestHeaders(): Promise<Record<string, string>> {
  if (!isBrowserPersistenceEnabled()) return {};
  const resolvedLearnerKey = await getPersistenceLearnerKey();
  const token = process.env.NEXT_PUBLIC_PERSISTENCE_TOKEN;
  return {
    'x-learner-key': resolvedLearnerKey,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

if (isBrowserPersistenceEnabled()) {
  const learnerKey = getPersistenceLearnerKey;
  const headers = getPersistenceRequestHeaders;

  const runtimeOptions = {
    store: () =>
      new HttpRuntimeStore({
        baseUrl: '/api/persistence',
        headers: headers satisfies HttpRuntimeHeadersHook,
      }),
    learnerKey,
  };
  const documentOptions: DocumentStorageOptions = {
    store: ({ validateScene, validateStage }) =>
      new HttpDocumentStore({
        baseUrl: '/api/persistence',
        headers: headers satisfies HttpDocumentHeadersHook,
        validateScene,
        validateStage,
      }),
  };
  try {
    // All checks are mutation-free. Once they pass, the synchronous configure
    // calls cannot leave only a subset of the persistence seams configured.
    assertAssetPoolStorageConfigurable();
    assertRuntimeStorageConfigurable();
    assertDocumentStorageConfigurable();
    configureAssetPoolStorage({
      serverBacked: true,
      store: () => new HttpAssetStore({ baseUrl: '/api/persistence', headers }),
    });
    configureRuntimeStorage(runtimeOptions);
    configureDocumentStorage(documentOptions);
  } catch (error) {
    console.error(
      'FATAL: server-backed persistence bootstrap failed; no storage seam changes were applied',
      error,
    );
  }
}
